d = document;

onload = function() {
    if (!new URL(location.href).host.endsWith(".micronet")) {
        d.querySelector("#banner").textContent = "Looks like you're browsing this micro:net page on the internet. To browse .micronet sites, you'll need to connect a micro:net modem.";
    }
};