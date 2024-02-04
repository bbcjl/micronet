var common = require("./common");

exports.MAX_PACKET_PAYLOAD_LENGTH = 128;

exports.commands = {
    CREATE_REQUEST_CONVERSATION: 0x10,
    READY_TO_RECEIVE_PACKET: 0x11,
    SEND_PACKET: 0x12,
    ACK_REQUEST_RECEIVED: 0x13,
    ACK_RESPONSE_RECEIVED: 0x14,
    RESPOND_TO_ACK: 0x15,
    ERROR: 0x40
};

exports.errorTypes = {
    UNKNOWN: 0x00,
    UNKNOWN_CONVERSATION: 0x01,
    UNKNOWN_PACKET: 0x02,
    INVALID_STATE: 0x03
};

exports.ProtocolError = class extends Error {
    constructor(errorType) {
        super(`Protocol error (type ${common.hex(errorType, 2)})`);

        this.name = "ProtocolError";
        this.errorType = errorType;
    }
}

function writeHeader(buffer, command) {
    buffer.write("mn", 0);
    buffer.writeUInt8(1, 2);
    buffer.writeUInt8(command, 3);

    return 4;
}

exports.createRequestConversation = function(senderId, receiverId, conversationId, size, packetCount) {
    var buffer = Buffer.alloc(14);

    var offset = writeHeader(buffer, exports.commands.CREATE_REQUEST_CONVERSATION);

    offset = buffer.writeUInt16BE(senderId, offset);
    offset = buffer.writeUInt16BE(receiverId, offset);
    offset = buffer.writeUInt16BE(conversationId, offset);
    offset = buffer.writeUInt16BE(size, offset);
    offset = buffer.writeUInt16BE(packetCount, offset);

    return buffer;
};

exports.readyToReceivePacket = function(senderId, receiverId, conversationId, packetIndex) {
    var buffer = Buffer.alloc(12);

    var offset = writeHeader(buffer, exports.commands.READY_TO_RECEIVE_PACKET);

    offset = buffer.writeUInt16BE(senderId, offset);
    offset = buffer.writeUInt16BE(receiverId, offset);
    offset = buffer.writeUInt16BE(conversationId, offset);
    offset = buffer.writeUInt16BE(packetIndex, offset);

    return buffer;
};

exports.sendPacket = function(senderId, receiverId, conversationId, packetIndex, payload) {
    var buffer = Buffer.alloc(12 + payload.length);

    var offset = writeHeader(buffer, exports.commands.SEND_PACKET);

    offset = buffer.writeUInt16BE(senderId, offset);
    offset = buffer.writeUInt16BE(receiverId, offset);
    offset = buffer.writeUInt16BE(conversationId, offset);
    offset = buffer.writeUInt16BE(packetIndex, offset);

    for (var i = 0; i < payload.length; i++) {
        buffer[offset + i] = payload[i];
    }

    return buffer;
};

exports.ackRequestRecieved = function(senderId, receiverId, conversationId, size, packetCount) {
    var buffer = Buffer.alloc(14);

    var offset = writeHeader(buffer, exports.commands.ACK_REQUEST_RECEIVED);

    offset = buffer.writeUInt16BE(senderId, offset);
    offset = buffer.writeUInt16BE(receiverId, offset);
    offset = buffer.writeUInt16BE(conversationId, offset);
    offset = buffer.writeUInt16BE(size, offset);
    offset = buffer.writeUInt16BE(packetCount, offset);

    return buffer;
};

exports.ackResponseReceived = function(senderId, receiverId, conversationId) {
    var buffer = Buffer.alloc(10);

    var offset = writeHeader(buffer, exports.commands.ACK_RESPONSE_RECEIVED);

    offset = buffer.writeUInt16BE(senderId, offset);
    offset = buffer.writeUInt16BE(receiverId, offset);
    offset = buffer.writeUInt16BE(conversationId, offset);

    return buffer;
};

exports.respondToAck = function(senderId, receiverId, conversationId) {
    var buffer = Buffer.alloc(10);

    var offset = writeHeader(buffer, exports.commands.RESPOND_TO_ACK);

    offset = buffer.writeUInt16BE(senderId, offset);
    offset = buffer.writeUInt16BE(receiverId, offset);
    offset = buffer.writeUInt16BE(conversationId, offset);

    return buffer;
};

exports.error = function(senderId, receiverId, errorType) {
    var buffer = Buffer.alloc(9);

    var offset = writeHeader(buffer, exports.commands.ERROR);

    offset = buffer.writeUInt16BE(senderId, offset);
    offset = buffer.writeUInt16BE(receiverId, offset);
    offset = buffer.writeUInt8(errorType, offset);

    return buffer;
};

exports.parseMessage = function(buffer) {
    if (buffer.toString("utf-8", 0, 2) != "mn") {
        return new Error("Not a micro:net message");
    }

    var offset = 2;

    var version = buffer.readUInt8(offset); offset += 1;

    if (version != 1) {
        return new Error("Incompatible micro:net version number");
    }

    var command = buffer.readUInt8(offset); offset += 1;
    var data = {command};

    if ([
        exports.commands.CREATE_REQUEST_CONVERSATION,
        exports.commands.READY_TO_RECEIVE_PACKET,
        exports.commands.SEND_PACKET,
        exports.commands.ACK_REQUEST_RECEIVED,
        exports.commands.ACK_RESPONSE_RECEIVED,
        exports.commands.RESPOND_TO_ACK
    ].includes(command)) {
        data.senderId = buffer.readUint16BE(offset); offset += 2;
        data.receiverId = buffer.readUint16BE(offset); offset += 2;
        data.conversationId = buffer.readUint16BE(offset); offset += 2;
    }

    switch (command) {
        case exports.commands.CREATE_REQUEST_CONVERSATION:
            data.size = buffer.readUint16BE(offset); offset += 2;
            data.packetCount = buffer.readUint16BE(offset); offset += 2;

            return data;

        case exports.commands.READY_TO_RECEIVE_PACKET:
            data.packetIndex = buffer.readUint16BE(offset); offset += 2;

            return data;

        case exports.commands.SEND_PACKET:
            data.packetIndex = buffer.readUint16BE(offset); offset += 2;
            data.payload = buffer.subarray(offset);

            return data;

        case exports.commands.ACK_REQUEST_RECEIVED:
            data.size = buffer.readUint16BE(offset); offset += 2;
            data.packetCount = buffer.readUint16BE(offset); offset += 2;

            return data;

        case exports.commands.ACK_RESPONSE_RECEIVED:
        case exports.commands.RESPOND_TO_ACK:
            return data;

        case exports.commands.ERROR:
            var data = {command};

            data.senderId = buffer.readUint16BE(offset); offset += 2;
            data.receiverId = buffer.readUint16BE(offset); offset += 2;
            data.errorType = buffer.readUINt8(offset); offset += 1;

            return data;

        default:
            return new Error(`Unknown command: ${common.hex(command, 2)}`);
    }
};