// Firebase initializtion
const firebaseConfig = {
    apiKey: "AIzaSyAsO3mp8p4V23gDIBcAS913k3bh-qreU7Q",
    authDomain: "carunch-fs.firebaseapp.com",
    projectId: "carunch-fs",
    storageBucket: "carunch-fs.appspot.com",
    messagingSenderId: "110033830309",
    appId: "1:110033830309:web:da0d8373616a000bbf284c"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Create a root reference
const storageRef = firebase.storage().ref();

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const urlParams = new URLSearchParams(window.location.search);

const qualtrics_id = urlParams.get("qid");
const session_ref = uuidv4();
let entry = -1;

function make_ref() {
    entry += 1;
    return 'uploaded/' + qualtrics_id + '--' + session_ref + '--' + entry + '.webm'
}

let guidref = storageRef.child(make_ref());

// Our input frames will come from here.
const videoElement = document.getElementsByClassName('input_video')[0];

let scene, camera, renderer, plate, edible, edibles, crunches;
let mediaRecorder, recordedBlobs, sourceBuffer;
let stream;

// Create an empty scene

const fov = 45;
const videoScreenDistance = 900.0;
const screenWidth = 1280;
const screenHeight = 720;
const aspect = screenWidth/screenHeight;
let isFoodAvailable = false;

function screenSpaceToWorldSpace(px, py, distance) {
    const factor = distance * Math.tan(Math.PI * fov / 2 / 180);
    return new THREE.Vector3(
        (1 - 2 * px) * aspect * factor,
        (1 - 2 * py) * factor,
        -distance,
    )
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function buildSpriteFromImgURL(url) {
    return new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.TextureLoader().load(url)
    }));
}

function buildSpriteFromImgURLWithRotation(url, rotation) {
    const material = new THREE.SpriteMaterial({
        map: new THREE.TextureLoader().load(url),
        rotation: rotation
    });
    return new THREE.Sprite(material);
}

const next_button = document.getElementById("next_button");
const instructions_text = document.getElementById("instructions_text");
const instructions_box = document.getElementById("instructions_box");

function forwardButton() {
    next_button.step = next_button.step + 1;
    switch(next_button.step) {
        case 1:
            instructions_text.textContent = "First, ensure your sound is on.";
            break;
        case 2:
            instructions_text.textContent = "Next, open and close your mouth. " +
                "If the program does not respond, make sure your face is well-lit and within view of the camera. " +
                "If you still have trouble, alert the course staff.";
            next_button.disabled = true;
            next_button.textContent = "Begin";
            break;
        case 3:
            instructions_box.hidden = true;
            buildPlate(scene);
            startRecording();
            next_button.hidden = true;
            break;
        default:
            console.log("Error counting...");

    }
}

next_button.step = 0;
next_button.onclick = forwardButton;

function randomOffset(v, i, mag) {
    return new THREE.Vector3(Math.sin(i*i) * mag, Math.cos(i*i) * mag, mag * 0.1 * Math.sin(i*i*i)).add(v);
}

function buildMakhana(id) {
    const makhana = buildSpriteFromImgURLWithRotation(
        "makhana/makhana" + (id % 4 + 1) + ".png",
        id*id*1.6
    );
    makhana.scale.copy(new THREE.Vector3(.05, .05, 1));
    makhana.position.copy(randomOffset(
        new THREE.Vector3(-0.025 + .01 * (id % 6), -0.04 - .005 * Math.floor(id / 6), -0.14 + .005 * Math.floor(id / 6)),
        id + 3, 0.002
    ));
    return makhana;
}

function buildKale(id) {
    const makhana = buildSpriteFromImgURLWithRotation(
        "kale/kale" + (id % 5 + 1) + ".png",
        id*id*1.6
    );
    makhana.scale.copy(new THREE.Vector3(.02, .02, 1));
    makhana.position.copy(randomOffset(
        new THREE.Vector3(-0.025 + .01 * (id % 6), -0.04 - .005 * Math.floor(id / 6), -0.14 + .005 * Math.floor(id / 6)),
        id + 3, 0.002
    ));
    return makhana;
}

// this one returns an array of makhanas
function buildMakhanas() {
    if (urlParams.get("content") === "makhana") {
        return Array(12).fill(1).map((x, y) => x + y).map(buildMakhana);
    } else if (urlParams.get("content") === "kale") {
        return Array(12).fill(1).map((x, y) => x + y).map(buildKale);
    } else {
        console.log("Content unspecified");
    }

}

function buildPlate(scene) {
    // make actual plate
    plate = buildSpriteFromImgURL("plate.png");
    plate.scale.copy(new THREE.Vector3(1.9/10, .792/10, 1));
    plate.position.copy(new THREE.Vector3(-0, -0.10, -0.3));
    scene.add(plate);

    edibles = buildMakhanas();
    edibles.forEach((ed) => {scene.add(ed);});

    // TODO: upon eating, clone new one to edible.

    edible = edibles[getRandomInt(edibles.length)];
    edibles = edibles.filter((ed) => !(ed === edible));

    isFoodAvailable = true;
}

function buildTable(scene) {

    const table = new THREE.Mesh(
        new THREE.PlaneGeometry(4.5, 1.8, 2),
        new THREE.MeshBasicMaterial( {map: new THREE.TextureLoader().load('table.jpg'), side : THREE.DoubleSide} )
    );

    table.rotation.x = Math.PI / 2;
    table.position.copy(new THREE.Vector3(0, -1, -3));
    scene.add(table);
}

function buildVideoTexture(scene) {
    const videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.minFilter = THREE.LinearFilter;
    const videoMaterial =  new THREE.MeshBasicMaterial( {map: videoTexture, side: THREE.BackSide, toneMapped: false} );
    const screen = new THREE.PlaneGeometry(
        2 * aspect * videoScreenDistance * Math.tan(Math.PI * fov / 2 / 180),
        2 * videoScreenDistance * Math.tan(Math.PI * fov / 2 / 180),
        1);
    const videoScreen = new THREE.Mesh(screen, videoMaterial);
    videoScreen.position.z = -videoScreenDistance;
    videoScreen.rotation.y = Math.PI;
    scene.add(videoScreen);

}

function initRenderer() {

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera( fov, aspect, 0.1, 1000 );
    renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setClearColor("#000000");
    renderer.setSize( videoElement.videoWidth, videoElement.videoHeight );
    document.getElementById("rendererTarget").append(renderer.domElement);

    buildVideoTexture(scene);
    buildTable(scene);

    const render = function () {
        requestAnimationFrame( render );
        renderer.render(scene, camera);
    };

    render();
}

crunches = [
    new Audio("makhana/makhana_longer_-01.ogg"),
    new Audio("makhana/makhana_longer_-02.ogg"),
    new Audio("makhana/makhana_longer_-03.ogg"),
    new Audio("makhana/makhana_longer_-04.ogg"),
    new Audio("makhana/makhana_longer_-05.ogg"),
    new Audio("makhana/makhana_longer_-06.ogg")
]

videoElement.addEventListener('loadedmetadata', (event) => {
    initRenderer();
    stream = renderer.domElement.captureStream(); // frames per second
    console.log('Started stream capture from canvas element: ', stream);
})

let isSoundPlayable = true;
let wasPreviousMouthOpen = false;

function onResults(results) {

    // get lip points
    if (results.multiFaceLandmarks) {
        for (const landmarks of results.multiFaceLandmarks) {

            // Is the mouth open?
            let isMouthOpen = (Math.pow(landmarks[13].x - landmarks[14].x, 2) +
                Math.pow(landmarks[13].y - landmarks[14].y, 2)) * 5 >
                Math.pow(landmarks[291].x - landmarks[62].x, 2) +
                Math.pow(landmarks[291].y - landmarks[62].y, 2);

            if (isMouthOpen) {
                if (isFoodAvailable) {
                    // canvasCtx.fillStyle = "#30ff30";
                    let target = screenSpaceToWorldSpace(
                        (landmarks[13].x + landmarks[14].x)/2,
                        (landmarks[13].y + landmarks[14].y)/2,
                        0.2
                    );
                    const alpha = 0.3;
                    //console.log(target, cube.position);
                    edible.position.addVectors(edible.position.multiplyScalar(1 - alpha), target.multiplyScalar(alpha));
                }

            } else {
                //canvasCtx.fillStyle = "#ff3030";
                if (isSoundPlayable && wasPreviousMouthOpen) {
                    next_button.disabled = false;
                    isSoundPlayable = false;
                    if (isFoodAvailable) {
                        crunches[getRandomInt(crunches.length)].play();

                        scene.remove(edible);
                        if (edibles.length > 0) {
                            edible = edibles[getRandomInt(edibles.length)];
                            edibles = edibles.filter((ed) => !(ed === edible));
                        }
                        else {
                            setTimeout(stopRecording, 1000); // get an extra one second of data.
                            // tell people we're done.
                            instructions_box.hidden = false;
                            instructions_text.textContent = "Thank you! Please wait while your data is being processed."
                        }
                    }
                    setTimeout(
                        function() {isSoundPlayable = true;},
                        300
                    )
                }
            }
            wasPreviousMouthOpen = isMouthOpen;
        }
    }
}

const faceMesh = new FaceMesh({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.1/${file}`;
    }});
faceMesh.onResults(onResults);

// Instantiate a camera. We'll feed each frame we receive into the solution.
const mediapipeCamera = new Camera(videoElement, {
    onFrame: async () => {
        await faceMesh.send({image: videoElement});
    },
    width: 1280,
    height: 720
});
mediapipeCamera.start();

const mediaSource = new MediaSource();
mediaSource.addEventListener('sourceopen', handleSourceOpen, false);

function handleSourceOpen(event) {
    console.log('MediaSource opened');
    sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8"');
    console.log('Source buffer: ', sourceBuffer);
}

function handleDataAvailable(event) {
    if (event.data && event.data.size > 0) {
        recordedBlobs.push(event.data);
    }
}

function handleStop(event) {
    console.log('Recorder stopped: ', event);
    const superBuffer = new Blob(recordedBlobs, {type: 'video/webm'});
    // video.src = window.URL.createObjectURL(superBuffer);
}

// The nested try blocks will be simplified when Chrome 47 moves to Stable
function startRecording() {
    let options = {mimeType: 'video/webm'};
    recordedBlobs = [];
    try {
        mediaRecorder = new MediaRecorder(stream, options);
    } catch (e0) {
        console.log('Unable to create MediaRecorder with options Object: ', e0);
        try {
            options = {mimeType: 'video/webm,codecs=vp9'};
            mediaRecorder = new MediaRecorder(stream, options);
        } catch (e1) {
            console.log('Unable to create MediaRecorder with options Object: ', e1);
            try {
                options = 'video/vp8'; // Chrome 47
                mediaRecorder = new MediaRecorder(stream, options);
            } catch (e2) {
                alert('MediaRecorder is not supported by this browser.\n\n' +
                    'Try Firefox 29 or later, or Chrome 47 or later, ' +
                    'with Enable experimental Web Platform features enabled from chrome://flags.');
                console.error('Exception while creating MediaRecorder:', e2);
                return;
            }
        }
    }
    console.log('Created MediaRecorder', mediaRecorder, 'with options', options);
    mediaRecorder.onstop = handleStop;
    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorder.start(100); // collect 100ms of data
    console.log('MediaRecorder started', mediaRecorder);
}

function stopRecording() {
    mediaRecorder.stop();
    console.log('Recorded Blobs: ', recordedBlobs);
    upload();
}

function upload() {
    const file = new Blob(recordedBlobs, {type: 'video/webm'});
    const uploadTask = guidref.put(file)

    // Register three observers:
    // 1. 'state_changed' observer, called any time the state changes
    // 2. Error observer, called on failure
    // 3. Completion observer, called on successful completion
    uploadTask.on('state_changed',
        (snapshot) => {
            // Observe state change events such as progress, pause, and resume
            // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
            var progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('Upload is ' + progress + '% done');
            switch (snapshot.state) {
                case firebase.storage.TaskState.PAUSED: // or 'paused'
                    console.log('Upload is paused');
                    break;
                case firebase.storage.TaskState.RUNNING: // or 'running'
                    console.log('Upload is running');
                    break;
            }
        },
        (error) => {
            console.log(error);
        },
        () => {
            instructions_text.textContent = "Thank you for completing this part of the survey.\nClose " +
                "this tab and return to the original survey tab."
        }
    );
    guidref = storageRef.child(make_ref());
}