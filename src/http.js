exports.parseRequest = function(request, preferredHost = null) {
    var headersEnd = null;
    var headerData = request;
    var bodyData = Buffer.alloc(0);
    
    if (request.indexOf("\n\n") > -1) {
        headersEnd = request.indexOf("\n\n") + 2;
    } else if (request.indexOf("\r\n\r\n") > -1) {
        headersEnd = request.indexOf("\r\n\r\n") + 4;
    }

    if (headersEnd != null) {
        headerData = request.subarray(0, headersEnd);
        bodyData = request.subarray(headersEnd);
    }

    var headerLines = headerData
        .toString()
        .split("\n")
        .map((line) => line.replace(/\r/g, ""))
        .filter((line) => line != "")
    ;

    var requestLine = headerLines.shift().split(" ");

    var headers = {};

    headerLines.forEach(function(line) {
        var match = line.match(/^(.*?): (.*)$/);

        if (match[1].toLowerCase() == "host" && preferredHost != null) {
            headers[match[1]] = preferredHost;

            return;
        }

        headers[match[1]] = match[2];
    });

    return {
        method: requestLine[0],
        pathname: requestLine[1],
        headers,
        body: bodyData
    };
};

exports.generateResponse = function(response) {
    var headerLines = [`HTTP/1.1 ${response.status} ${response.statusText}`];

    Object.keys(response.headers).forEach(function(key) {
        headerLines.push(`${key}: ${response.headers[key]}`);
    });

    return Buffer.concat([
        Buffer.from(headerLines.join("\n") + "\n\n"),
        Buffer.from(response.body)
    ]);
};