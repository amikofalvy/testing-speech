try {
    require('./env.js');
} catch(e){ 
    if (!process.env.REV_TOKEN) console.log('error: you need process.env.REV_TOKEN defined in the env.js file, or in the call to this node script.')
}

const fs = require('fs');

// Creates a client
const RevRecognize = require('./revRecognize');

const stream = new RevRecognize({
    url: `wss://api.rev.ai/speechtotext/v1alpha/stream?access_token=${process.env.REV_TOKEN}&content_type=audio/x-raw;layout=interleaved;rate=44100;format=S16LE;channels=1`,
    headers: ''
});
stream.on('error', err => {
    console.log({ msg: 'error from rev stream', err });
}).on('results', results => {
    console.log('Transcription: ', results);
}).on('data', data => {
    console.log('got final tx data object');
    console.log({keys: Object.keys(data), });
})

const filename = './discovery-1min.raw'

// Stream an audio file from disk to the Speech API, e.g. "./resources/audio.raw"
fs.createReadStream(filename).pipe(stream);

const secs = 85;
console.log(`ending stream in ${secs} sec`);
setTimeout(() => {
    console.log('end rec stream!')
    stream.emit('end');
    stream.stop();
    console.log('waiting 5 more secs for stream to print final message');
    setTimeout(() => {
        console.log('end scrript')
    }, 5000);
}, secs*1000);
