exports.toId = function(domain) {
    var hashValue = 0xF758; // Magic value (which is _totally_ not to make "bbc" resolve to 0x0BBC ;D)

    for (var i = 0; i < domain.length; i++) {
        hashValue += domain.charCodeAt(i) * ((((i + 3) % 100) ** 2) + 1);
    }

    return hashValue % 0x1_0000;
};