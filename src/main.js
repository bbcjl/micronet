const {SerialPort} = require("serialport");
const connect = require("connect");
const vhost = require("vhost");

const args = require("minimist")(process.argv.slice(2));
const app = connect();

var common = require("./common");
var domains = require("./domains");
var conversations = require("./conversations");
var http = require("./http");

const SPECIFIED_DOMAIN_ID = args["domain"] ? domains.toId(args["domain"]) : null;
const SPECIFIED_ID = args["id"] ? parseInt(args["id"], 16) : null;
const WANTED_ID = SPECIFIED_DOMAIN_ID || SPECIFIED_ID;
const PORT = args["port"] ? parseInt(args["port"]) : 2016;
const SERVER_HOST = args["host"] || "localhost:8000";
const UPDATE_INDICATORS = !args["disable-indicators"];

var port = new SerialPort({
    path: args["serial-port"] || "/dev/ttyACM0",
    baudRate: Number(args["baud-rate"]) || 115_200
});

var dataStream = Buffer.alloc(0);
var modemCommand = null;
var modemPayloadLength = 0;

var manager = new conversations.ConversationManager(WANTED_ID != null ? WANTED_ID : undefined);

manager.requestHandler = function(payload) {
    var request = http.parseRequest(payload, SERVER_HOST.split("/")[0]);

    var responseData;
    var headers = {};

    return fetch(`http://${SERVER_HOST}${request.pathname}`, {
        method: request.method,
        headers: request.headers,
        body: !["GET", "HEAD"].includes(request.method) ? request.body : undefined
    }).then(function(response) {
        responseData = response;

        response.headers.forEach(function(value, key) {
            headers[key] = value;
        });

        return response.arrayBuffer();
    }).then(function(body) {
        delete headers["connection"];
        delete headers["keep-alive"];
        delete headers["accept-ranges"];
        delete headers["transfer-encoding"];

        var rawResponse = http.generateResponse({
            ...responseData,
            body,
            headers
        });

        return Promise.resolve(rawResponse);
    }).catch(function(error) {
        console.warn(error);

        return Promise.resolve("");
    });
};

app.use(vhost("*.micronet", function(request, response, next) {
    var rawRequest = [`GET ${new URL(request.url).pathname} HTTP/1.1`];
    var headers = request.rawHeaders;

    while (headers.length > 0) {
        rawRequest.push(`${headers.shift()}: ${headers.shift()}`);
    }

    manager.createRequest(domains.toId(request.vhost[0]), Buffer.from(rawRequest.join("\n"))).then(function(responseData) {
        response.socket.end(responseData);
    });
}));

var lastOpenConversationCount = 0;
var lastConversationProgress = 0;
var shouldClearLastValues = false;

port.on("open", function() {
    console.log(`Modem connected; micro:net is up! (ID ${common.hex(manager.id)})`);

    setInterval(function() {
        if (manager.hasMessagesInOutbox) {
            var message = manager.getMessageFromOutbox();

            port.write("mm");
            port.write(Buffer.from([0x01, 0x01, message.length]));
            port.write(message);
        }

        manager.update();
    });

    if (UPDATE_INDICATORS) {
        setInterval(function() {
            if (manager.openConversationCount != lastOpenConversationCount) {
                port.write("mm");
                port.write(Buffer.from([0x01, 0x03, 0x01, manager.openConversationCount]));
        
                lastOpenConversationCount = manager.openConversationCount;
                shouldClearLastValues = true;
            }
    
            var oldestConversation = manager.conversations.find((conversation) => conversation.isOpen && (
                conversation instanceof conversations.OutboundRequestConversation ||
                conversation instanceof conversations.InboundRequestConversation
            ));
    
            var conversationProgress = 0;
    
            if (oldestConversation != null) {
                var requestPercentage = oldestConversation.requestPacketCount != 0 ? oldestConversation.requestProgress / oldestConversation.requestPacketCount : 0;
                var responsePercentage = oldestConversation.responsePacketCount != 0 ? oldestConversation.responseProgress / oldestConversation.responsePacketCount : 0;
    
                conversationProgress = (requestPercentage + responsePercentage) / 2;
            } else {
                conversationProgress = 0;
            }
    
            if (conversationProgress != lastConversationProgress) {
                port.write("mm");
                port.write(Buffer.from([0x01, 0x02, 0x01, Math.round(conversationProgress * 10)]));
        
                lastOpenConversationCount = conversationProgress;
                shouldClearLastValues = true;
            }
        }, 500);
    
        setInterval(function() {
            if (!shouldClearLastValues) {
                shouldClearLastValues = false;
    
                return;
            }
    
            lastOpenConversationCount = null;
            lastConversationProgress = null;
        }, 2_000);
    }

    app.listen(PORT, function() {
        console.log(`Modem available on port ${PORT}`);
    });
});

port.on("data", function(data) {
    dataStream = Buffer.concat([dataStream, data]);

    if (modemCommand == null && dataStream.length >= 5) {
        if (dataStream.subarray(0, 3).equals(Buffer.from([0x4D, 0x4D, 0x01]))) {
            modemCommand = dataStream[3];
            modemPayloadLength = dataStream[4] || 0;

            dataStream = dataStream.subarray(5);
        } else {
            dataStream = dataStream.subarray(1);
        }
    }

    if (modemCommand != null && dataStream.length >= modemPayloadLength) {
        var data = dataStream.subarray(0, modemPayloadLength);

        switch (modemCommand) {
            case 0x01:
                manager.addMessageToInbox(data);
                break;
    
            default:
                console.warn(`Unknown micro:modem command: ${common.hex(modemCommand, 2)}`);
                break;
        }

        dataStream = dataStream.subarray(modemPayloadLength);
        modemCommand = null;
        modemPayloadLength = 0;

        return;
    }
});