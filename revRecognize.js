const Duplex = require('stream').Duplex;
const util = require('util');
const W3CWebSocket = require('websocket').w3cwebsocket;



/**
 * pipe()-able Node.js Readable/Writeable stream - accepts binary audio and emits text in it's `data` events.
 * Also emits `results` events with interim results and other data.
 *
 * Cannot be instantiated directly, instead reated by calling #createRecognizeStream()
 *
 * Uses WebSockets under the hood. For audio with no recognizable speech, no `data` events are emitted.
 * @param {Object} options
 * @constructor
 */
function RecognizeStream(options) {
    Duplex.call(this, options);
    this.options = options;
    this.listening = false;
    this.initialized = false;
}
util.inherits(RecognizeStream, Duplex);

RecognizeStream.prototype.initialize = function () {
    const options = this.options;

    const url = options.url;
    const closingMessage = 'EOS';

    const self = this;

    const socket = new W3CWebSocket(url, null, null, options.headers, null);
    this.socket = socket;

    // when the input stops, let the service know that we're done
    self.on('finish', function () {
        console.log('RR finish');
        if (self.socket && self.socket.readyState === W3CWebSocket.OPEN) {
            self.socket.send(closingMessage);
        } else {
            self.once('connect', function () {
                self.socket.send(closingMessage);
            });
        }
    });

    socket.onerror = function (error) {
        console.log('RR got err');
        self.listening = false;
        self.emit('error', error);
    };

    this.socket.onopen = function () {
        console.log('RR sent opening data');
        self.emit('connect');
    };

    this.socket.onclose = function (e) {
        console.log('RR onclose');
        self.listening = false;
        self.push(null);

        /**
         * @event RecognizeStream#close
         * @param {Number} reasonCode
         * @param {String} description
         */
        self.emit('close', e.code, e.reason);
    };

    /**
     * @event RecognizeStream#error
     */
    function emitError(msg, frame, err) {
        if (err) {
            err.message = msg + ' ' + err.message;
        } else {
            err = new Error(msg);
        }
        err.raw = frame;
        self.emit('error', err);
    }

    socket.onmessage = function (frame) {
        console.log('RR onmessage');
        if (typeof frame.data !== 'string') {
            return emitError('Unexpected binary data received from server', frame);
        }

        let data;
        try {
            data = JSON.parse(frame.data);
        } catch (jsonEx) {
            return emitError('Invalid JSON received from service:', frame, jsonEx);
        }

        let recognized = false;
        if (data.error) {
            emitError(data.error, frame);
            recognized = true;
        }

        console.log('RR',JSON.stringify(data));

        if (data.type === 'connected') {
            // this is emitted both when the server is ready for audio
            if (!self.listening) {
                self.listening = true;
                self.emit('listening');
            }
            recognized = true;
        }

        if (["partial", "final"].indexOf(data.type) > -1) {

            /**
             * Object with interim or final results, including possible alternatives. May have no results at all for empty audio files.
             * @event RecognizeStream#results
             * @param {Object} results
             */
            //   if (data.transcript) data.results = data.transcript;
            self.emit('results', data.transcript);
            // note: currently there is always either no entries or exactly 1 entry in the results array. However, this may change in the future.
            if (data.type == 'final') {

                /**
                 * Finalized text
                 * @event RecognizeStream#data
                 * @param {String} transcript
                 */
                self.push(data.elements, 'utf8'); // this is the "data" event that can be easily piped to other streams
            }
            recognized = true;
        }

        if (!recognized) {
            emitError('Unrecognised message from server', frame);
        }
    };

    this.initialized = true;
};

RecognizeStream.prototype._read = function () /* size*/ {
    // there's no easy way to control reads from the underlying library
    // so, the best we can do here is a no-op
};

RecognizeStream.prototype._write = function (chunk, encoding, callback) {
    const self = this;
    if (self.listening) {
        self.socket.send(chunk);
        this.afterSend(callback);
    } else {
        if (!this.initialized) {
            this.initialize();
        }
        this.once('listening', function () {
            console.log('RR listening')
            self.socket.send(chunk);
            //   self.afterSend(callback);
        });
    }
};

// flow control - don't ask for more data until we've finished what we have
// todo: see if this can be improved
RecognizeStream.prototype.afterSend = function (next) {
    console.log('RR afterSend ')
    // note: bufferedAmount is currently always 0
    // see https://github.com/theturtle32/WebSocket-Node/issues/243
    if (this.socket.bufferedAmount <= (this._writableState.highWaterMark || 0)) {
        process.nextTick(next);
    } else {
        setTimeout(this.afterSend.bind(this, next), 10);
    }
};

RecognizeStream.prototype.stop = function () {
    console.log('RR stop');
    this.emit('stopping');
    this.socket.send('EOS');
    this.listening = false;
    this.socket.close();
};

module.exports = RecognizeStream;