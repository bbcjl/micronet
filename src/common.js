exports.generateRandomId = function() {
    return Math.round(Math.random() * 0xFFFF);
}

exports.hex = function(value, pad = 4) {
    return `0x${Number(value).toString(16).toUpperCase().padStart(pad, "0")}`;
};