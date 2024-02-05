const fs = require("fs");
const {SerialPort} = require("serialport");
const connect = require("connect");
const vhost = require("vhost");

const args = require("minimist")(process.argv.slice(2));
const app = connect();

var common = require("./common");
var debug = require("./debug");
var domains = require("./domains");
var conversations = require("./conversations");

const SPECIFIED_DOMAIN_ID = args["domain"] ? domains.toId(args["domain"]) : null;
const SPECIFIED_ID = args["id"] ? parseInt(args["id"], 16) : null;
const WANTED_ID = SPECIFIED_DOMAIN_ID || SPECIFIED_ID;
const PORT = args["port"] ? parseInt(args["port"]) : 2016;
const SERVER_HOST = args["host"] || "localhost:8000";
const INDICATORS = !!args["indicators"];

var config = {};

try {
    if (args["config"] && fs.existsSync(args["config"])) {
        config = JSON.parse(fs.readFileSync(args["config"], "utf-8"));
    }
} catch (e) {
    console.error("Unable to load config");
    process.exit(1);
}

var port = new SerialPort({
    path: args["serial-port"] || "/dev/ttyACM0",
    baudRate: Number(args["baud-rate"]) || 115_200
});

var dataStream = Buffer.alloc(0);
var modemCommand = null;
var modemPayloadLength = 0;

var managers = [new conversations.ConversationManager(WANTED_ID != null ? WANTED_ID : undefined)];

managers[0].requestHandler = conversations.requestHandlerFactory(SERVER_HOST);

(config.managers || []).forEach(function(managerConfig) {
    var id = undefined;

    if (managerConfig["domain"]) {
        id = domains.toId(managerConfig["domain"]);
    } else {
        id = managerConfig["id"];
    }

    if (managers.find((manager) => manager.id == id)) {
        console.warn(`Manager with ID ${common.hex(id) + (managerConfig["domain"] ? ` (for domain \`${managerConfig["domain"]}\`)` : "")} already exists; skipping`);
    }

    var manager = new conversations.ConversationManager(id);

    if (managerConfig["host"]) {
        manager.requestHandler = conversations.requestHandlerFactory(managerConfig["host"]);
    }

    managers.push(manager);
});

app.use(vhost("*.micronet", function(request, response, next) {
    var rawRequest = [`GET ${new URL(request.url).pathname} HTTP/1.1`];
    var headers = request.rawHeaders;

    while (headers.length > 0) {
        rawRequest.push(`${headers.shift()}: ${headers.shift()}`);
    }

    managers[0].createRequest(domains.toId(request.vhost[0]), Buffer.from(rawRequest.join("\n"))).then(function(responseData) {
        response.socket.end(responseData);
    });
}));

var waitingForModemConnection = true;
var handshakeInterval = null;
var lastOpenConversationCount = 0;
var lastConversationProgress = 0;
var shouldClearLastValues = false;

function ready() {
    console.log(`Modem connected; micro:net is up! (main manager ID ${common.hex(managers[0].id)})`);

    setInterval(function() {
        managers.forEach(function(manager) {
            if (manager.hasMessagesInOutbox) {
                var message = manager.getMessageFromOutbox();
    
                port.write("mm");
                port.write(Buffer.from([0x01, 0x01, message.length]));
                port.write(message);
            }
    
            manager.update();
        });
    });

    if (INDICATORS) {
        setInterval(function() {
            if (managers[0].openConversationCount != lastOpenConversationCount) {
                port.write("mm");
                port.write(Buffer.from([0x01, 0x03, 0x01, managers[0].openConversationCount]));
        
                lastOpenConversationCount = managers[0].openConversationCount;
                shouldClearLastValues = true;
            }
    
            var oldestConversation = managers[0].conversations.find((conversation) => conversation.isOpen && (
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
        console.log(`micro:net is accessible on port ${PORT}`);
    });
}

port.on("open", function() {
    process.stdout.write("Waiting for modem...");

    handshakeInterval = setInterval(function() {
        port.write("@");
        process.stdout.write(".");
    }, 100);
});

port.on("data", function(data) {
    if (waitingForModemConnection) {
        console.log("");

        if (data[0] != "!".charCodeAt(0)) {
            console.warn("Invalid modem handshake data:", data);

            return;
        }

        waitingForModemConnection = false;

        clearInterval(handshakeInterval);
        ready();

        return;
    }

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
                debug.log(`      Receive:`, data);
                managers.forEach((manager) => manager.addMessageToInbox(data));
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