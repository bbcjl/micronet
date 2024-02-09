function FindProxyForURL(url, host) {
    if (shExpMatch(host, "*micronet")) {
        return "PROXY 127.0.0.1:2016";
    }
    return "DIRECT";
}