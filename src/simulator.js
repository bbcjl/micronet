const crypto = require("crypto");

var conversations = require("./conversations");

const PACKET_LOSS_CHANCE = 0.1;

var manager1 = new conversations.ConversationManager(0xAAAA);
var manager2 = new conversations.ConversationManager(0x0BBC);

var testRequestPayload = crypto.randomBytes(2_048);
var testResponsePayload = crypto.randomBytes(2_048);

manager1.requestHandler = function(payload) {
    return Promise.reject("This wasn't meant to happen");
};

manager2.requestHandler = function(payload) {
    if (payload.equals(testRequestPayload)) {
        console.log("Request matches!");
    } else {
        console.log("Request doesn't match:", payload, testRequestPayload);
    }

    return Promise.resolve(testResponsePayload);
};

manager1.createRequest(0x0BBC, testRequestPayload).then(function(payload) {
    if (payload.equals(testResponsePayload)) {
        console.log("Response matches!");
    } else {
        console.log("Response doesn't match:", payload, testResponsePayload);
    }
});

setInterval(function() {
    if (manager1.hasMessagesFromOutbox) {
        var message = manager1.getMessageFromOutbox();

        if (Math.random() > PACKET_LOSS_CHANCE) {
            manager2.addMessageToInbox(message);
        }
    }

    manager1.update();

    if (manager2.hasMessagesFromOutbox) {
        var message = manager2.getMessageFromOutbox();

        if (Math.random() > PACKET_LOSS_CHANCE) {
            manager1.addMessageToInbox(message);
        }
    }

    manager2.update();
}, 20);