var common = require("./common");
var debug = require("./debug");
var protocol = require("./protocol");

exports.RESEND_INTERVAL = 100;
exports.MAX_RESENDS = 50;
exports.CONVERSATION_ACTIVITY_EXPIRY = 2_000;

exports.states = {
    NONE: 0,
    OUTBOUND_SEND_REQUEST: 1,
    OUTBOUND_RECIEVE_RESPONSE: 2,
    INBOUND_RECEIVE_REQUEST: 3,
    INBOUND_SEND_RESPONSE: 4
};

exports.ConversationManager = class {
    constructor(myId = common.generateRandomId()) {
        this.id = myId;

        this.conversations = [];
        this.inbox = [];
        this.outbox = [];
    }

    get hasMessagesInOutbox() {
        return this.outbox.length > 0;
    }

    get openConversationCount() {
        return this.conversations.filter((conversation) => conversation.isOpen).length;
    }

    addMessageToInbox(message) {
        debug.log(`[${common.hex(this.id)}] Receive:`, message);

        this.inbox.push(message);
    }

    getMessageFromOutbox(message) {
        return this.outbox.shift(message);
    }

    updateOutbox() {
        var thisScope = this;

        for (var i = 0; i < this.conversations.length; i++) {
            var conversation = this.conversations[i];

            conversation.outbox.forEach(function(message) {
                debug.log(`[${common.hex(thisScope.id)}] Send:`, message);

                thisScope.outbox.push(message);
            });
            
            conversation.outbox = [];
        }
    }

    processNextInboxMessage() {
        var message = this.inbox.shift();

        if (!message) {
            return;
        }

        var parsedMessage;
        
        try {
            parsedMessage = protocol.parseMessage(message);
        } catch (e) {
            console.warn(e);

            return;
        }

        if (
            parsedMessage.command == protocol.commands.CREATE_REQUEST_CONVERSATION &&
            parsedMessage.receiverId == this.id &&
            !this.conversations.find((conversation) => conversation.conversationId == parsedMessage.conversationId)
        ) {
            var conversation = new exports.InboundRequestConversation(
                this.id,
                parsedMessage.senderId,
                parsedMessage.conversationId,
                parsedMessage.size,
                parsedMessage.packetCount
            );

            if (this.requestHandler) {
                conversation.requestHandler = this.requestHandler;
            }

            this.conversations.push(conversation);

            conversation.begin();

            return;
        }

        for (var i = 0; i < this.conversations.length; i++) {
            var conversation = this.conversations[i];

            if (!conversation.isOpen && parsedMessage.command != protocol.commands.ACK_RESPONSE_RECEIVED) {
                continue;
            }

            try {
                if (conversation.handleIncomingMessage(parsedMessage)) {
                    handled = true;
                    conversation.lastActive = Date.now();

                    break;
                }
            } catch (e) {
                console.error(e);
            }
        }
    }

    performResends() {
        this.conversations.forEach((conversation) => conversation.resend());
    }

    expireInactiveConversations() {
        this.conversations.forEach(function(conversation) {
            if (conversation.isOpen && Date.now() - conversation.lastActive >= exports.CONVERSATION_ACTIVITY_EXPIRY) {
                conversation.isOpen = false;
            }
        });
    }

    update() {
        this.processNextInboxMessage();
        this.updateOutbox();
        this.performResends();
        this.expireInactiveConversations();
    }

    createRequest(receiverId, requestPayload) {
        var thisScope = this;

        return new Promise(function(resolve, reject) {
            var request = new exports.OutboundRequestConversation(thisScope.id, receiverId, requestPayload);

            request.handleCompletedRequest = resolve;

            thisScope.conversations.push(request);

            request.begin();

            thisScope.updateOutbox();
        });
    }
};

exports.Conversation = class {
    constructor() {
        this.isOpen = true;
        this.outbox = [];
        this.resends = [];
        this.lastActive = Date.now();
    }

    handleIncomingMessage() {
        return false;
    }

    send(message, resendId = null, resendAfter = exports.RESEND_INTERVAL) {
        this.lastActive = Date.now();

        this.outbox.push(message);

        if (resendId != null) {
            this.resends.push({
                message,
                id: resendId,
                at: Date.now() + resendAfter,
                after: resendAfter,
                count: 0
            });
        }
    }

    resend() {
        var thisScope = this;

        this.resends.forEach(function(resend) {
            if (resend.at != null && Date.now() >= resend.at) {
                debug.log("Resend:", resend.id);

                thisScope.send(resend.message);

                resend.at = Date.now() + resend.after;
                resend.count++;
            }
        });

        this.resends = this.resends.filter((resend) => resend.count < exports.MAX_RESENDS);
    }

    clearResend(resendId) {
        this.resends = this.resends.filter((resend) => resend.id != resendId);
    }

    resetResendCount(resendId) {
        this.resends.forEach(function(resend) {
            if (resend.id == resendId) {
                resend.count = 0;
            }
        });
    }
};

exports.OutboundRequestConversation = class extends exports.Conversation {
    constructor(senderId, receiverId, requestPayload) {
        super();

        this.senderId = senderId;
        this.receiverId = receiverId;
        this.requestPayload = requestPayload;

        this.state = exports.states.OUTBOUND_SEND_REQUEST;
        this.conversationId = common.generateRandomId();
        this.responsePayload = null;
        this.responsePayloadPacketIndex = 0;

        this.requestProgress = 0;
        this.responseProgress = 0;
    }

    get requestPacketCount() {
        return Math.ceil(this.requestPayload.length / protocol.MAX_PACKET_PAYLOAD_LENGTH);
    }

    get responsePacketCount() {
        if (this.responsePayload == null) {
            return 0;
        }

        return Math.ceil(this.responsePayload.length / protocol.MAX_PACKET_PAYLOAD_LENGTH);
    }

    getRequestPacketPayload(packetIndex) {
        if (packetIndex >= this.requestPacketCount) {
            throw new protocol.ProtocolError(protocol.errorTypes.UNKNOWN_PACKET);
        }

        return this.requestPayload.subarray(packetIndex * protocol.MAX_PACKET_PAYLOAD_LENGTH, (packetIndex + 1) * protocol.MAX_PACKET_PAYLOAD_LENGTH);
    }

    getNextResponsePacketOrAck() {
        if (this.responsePayloadPacketIndex >= this.responsePacketCount) {
            this.send(protocol.ackResponseReceived(
                this.senderId,
                this.receiverId,
                this.conversationId
            ), "ackResponseReceived");

            return;
        }

        this.send(protocol.readyToReceivePacket(
            this.senderId,
            this.receiverId,
            this.conversationId,
            this.responsePayloadPacketIndex
        ), `response_p${this.responsePayloadPacketIndex}`);
    }

    begin() {
        this.send(protocol.createRequestConversation(
            this.senderId,
            this.receiverId,
            this.conversationId,
            this.requestPayload.length,
            this.requestPacketCount
        ), "createRequestConversation");
    }

    handleCompletedRequest(responsePayload) {}

    handleIncomingMessage(message) {
        if (message.senderId != this.receiverId || message.receiverId != this.senderId || message.conversationId != this.conversationId) {
            return false;
        }

        if (message.command == protocol.commands.READY_TO_RECEIVE_PACKET && this.state == exports.states.OUTBOUND_SEND_REQUEST) {
            this.clearResend("createRequestConversation");

            this.send(protocol.sendPacket(
                this.senderId,
                this.receiverId,
                this.conversationId,
                message.packetIndex,
                this.getRequestPacketPayload(message.packetIndex)
            ));

            if (message.packetIndex > this.requestProgress) {
                this.requestProgress = message.packetIndex;
            }

            return true;
        }

        if (message.command == protocol.commands.ACK_REQUEST_RECEIVED && this.state == exports.states.OUTBOUND_SEND_REQUEST) {
            this.state = exports.states.OUTBOUND_RECIEVE_RESPONSE;
            this.responsePayload = Buffer.alloc(message.size, 0x00);
            this.responsePayloadPacketIndex = 0;

            this.getNextResponsePacketOrAck();

            return true;
        }

        if (message.command == protocol.commands.SEND_PACKET && this.state == exports.states.OUTBOUND_RECIEVE_RESPONSE) {
            if (message.packetIndex < this.requestPayloadPacketIndex) {
                return true;
            }

            var byteIndex = message.packetIndex * protocol.MAX_PACKET_PAYLOAD_LENGTH;
            var checksum = 0;

            for (var i = 0; i < message.payload.length; i++) {
                if (byteIndex + i >= this.responsePayload.length) {
                    console.warn(`Incoming data for outbound request with conversation ID ${common.hex(this.conversationId)}: response payload overflow; ignoring extra bytes`);

                    break;
                }

                this.responsePayload[byteIndex + i] = message.payload[i];
                checksum += message.payload[i] * ((((i + 3) % 100) ** 2) + 1);
            }

            if (message.checksum == (checksum & 0xFF)) {
                this.clearResend(`response_p${message.packetIndex}`);

                this.responsePayloadPacketIndex++;

                if (message.packetIndex > this.responseProgress) {
                    this.responseProgress = message.packetIndex;
                }

                this.getNextResponsePacketOrAck(); 
            } else {
                this.resetResendCount(`request_p${message.packetIndex}`);

                console.warn(`Incoming data for outbound request with conversation ID ${common.hex(this.conversationId)}: checksum does not match for packet ${common.hex(message.packetIndex)}`);
            }

            return true;
        }

        if (message.command == protocol.commands.RESPOND_TO_ACK && this.state == exports.states.OUTBOUND_RECIEVE_RESPONSE) {
            this.clearResend("ackResponseReceived");

            this.isOpen = false;

            this.handleCompletedRequest(this.responsePayload);

            return true;
        }

        throw new protocol.ProtocolError(protocol.errorTypes.INVALID_STATE);
    }
};

exports.InboundRequestConversation = class extends exports.Conversation {
    constructor(senderId, receiverId, conversationId, size, packetCount) {
        super();

        this.senderId = senderId;
        this.receiverId = receiverId;
        this.conversationId = conversationId;

        void(packetCount); // We don't actually need the packet count as we can infer this from the request size

        this.state = exports.states.INBOUND_RECEIVE_REQUEST;
        this.requestPayload = Buffer.alloc(size, 0x00);
        this.requestPayloadPacketIndex = 0;
        this.responsePayload = null;

        this.requestProgress = 0;
        this.responseProgress = 0;
    }

    get requestPacketCount() {
        return Math.ceil(this.requestPayload.length / protocol.MAX_PACKET_PAYLOAD_LENGTH);
    }

    get responsePacketCount() {
        if (this.responsePayload == null) {
            return 0;
        }
 
        return Math.ceil(this.responsePayload.length / protocol.MAX_PACKET_PAYLOAD_LENGTH);
    }

    getResponsePacketPayload(packetIndex) {
        if (packetIndex >= this.responsePacketCount) {
            throw new protocol.ProtocolError(protocol.errorTypes.UNKNOWN_PACKET);
        }

        return this.responsePayload.subarray(packetIndex * protocol.MAX_PACKET_PAYLOAD_LENGTH, (packetIndex + 1) * protocol.MAX_PACKET_PAYLOAD_LENGTH);
    }

    requestHandler(requestPayload) {
        console.warn(`Unhandled inbound request with conversation ID ${common.hex(this.conversationId)} containing payload:`, requestPayload);

        return Promise.resolve(Buffer.alloc(0));
    }

    begin() {
        this.getNextRequestPacketOrHandleRequest();
    }

    sendResponse() {
        this.state = exports.states.INBOUND_SEND_RESPONSE;

        this.send(protocol.ackRequestRecieved(
            this.senderId,
            this.receiverId,
            this.conversationId,
            this.responsePayload.length,
            this.responsePacketCount
        ), "ackRequestReceived");
    }

    getNextRequestPacketOrHandleRequest() {
        var thisScope = this;

        if (this.requestPayloadPacketIndex >= this.requestPacketCount) {
            this.requestHandler(this.requestPayload).then(function(responsePayload) {
                thisScope.responsePayload = responsePayload;

                thisScope.sendResponse();
            });

            return;
        }

        this.send(protocol.readyToReceivePacket(
            this.senderId,
            this.receiverId,
            this.conversationId,
            this.requestPayloadPacketIndex
        ), `request_p${this.requestPayloadPacketIndex}`);
    }

    handleIncomingMessage(message) {
        if (message.senderId != this.receiverId || message.receiverId != this.senderId || message.conversationId != this.conversationId) {
            return false;
        }

        if (message.command == protocol.commands.SEND_PACKET && this.state == exports.states.INBOUND_RECEIVE_REQUEST) {
            if (message.packetIndex < this.requestPayloadPacketIndex) {
                return true;
            }

            var byteIndex = message.packetIndex * protocol.MAX_PACKET_PAYLOAD_LENGTH;
            var checksum = 0;

            for (var i = 0; i < message.payload.length; i++) {
                if (byteIndex + i >= this.requestPayload.length) {
                    console.warn(`Incoming data for inbound request with conversation ID ${common.hex(this.conversationId)}: request payload overflow; ignoring extra bytes`);

                    break;
                }

                this.requestPayload[byteIndex + i] = message.payload[i];
                checksum += message.payload[i] * ((((i + 3) % 100) ** 2) + 1);
            }

            if (message.checksum == (checksum & 0xFF)) {
                this.clearResend(`request_p${message.packetIndex}`);

                this.requestPayloadPacketIndex++;

                if (message.packetIndex > this.requestProgress) {
                    this.requestProgress = message.packetIndex;
                }

                this.getNextRequestPacketOrHandleRequest();
            } else {
                this.resetResendCount(`request_p${message.packetIndex}`);

                console.warn(`Incoming data for inbound request with conversation ID ${common.hex(this.conversationId)}: checksum does not match for packet ${common.hex(message.packetIndex)}`);
            }

            return true;
        }

        if (message.command == protocol.commands.READY_TO_RECEIVE_PACKET && this.state == exports.states.INBOUND_SEND_RESPONSE) {
            this.clearResend("ackRequestReceived");

            this.send(protocol.sendPacket(
                this.senderId,
                this.receiverId,
                this.conversationId,
                message.packetIndex,
                this.getResponsePacketPayload(message.packetIndex)
            ));

            if (message.packetIndex > this.responseProgress) {
                this.responseProgress = message.packetIndex;
            }

            return true;
        }

        if (message.command == protocol.commands.ACK_RESPONSE_RECEIVED && this.state == exports.states.INBOUND_SEND_RESPONSE) {
            this.send(protocol.respondToAck(
                this.senderId,
                this.receiverId,
                this.conversationId
            ));

            this.isOpen = false;

            return true;
        }
    }
};