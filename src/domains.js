exports.toId = function(domain) {
    var hashValue = 0;

    for (var i = 0; i < domain.length; i++) {
        hashValue += domain.charCodeAt(i);
        hashValue += i * 3;
        hashValue += (i % 100) ** 2;
    }

    hashValue += 0x0A87; // Magic value (which is _totally_ not to make "bbc" resolve to 0x0BBC ;D)

    return hashValue % 0x1_0000;
};