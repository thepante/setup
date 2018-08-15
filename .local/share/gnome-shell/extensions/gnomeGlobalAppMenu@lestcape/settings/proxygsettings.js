/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */
//
// Copyright 2011-2012 Canonical Ltd.
// Copyright 2014 Erik Devriendt
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License version 3, as published
// by the Free Software Foundation.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranties of
// MERCHANTABILITY, SATISFACTORY QUALITY, or FITNESS FOR A PARTICULAR
// PURPOSE.  See the GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program.  If not, see <http://www.gnu.org/licenses/>.
//
// In addition, as a special exception, the copyright holders give
// permission to link the code of portions of this program with the
// OpenSSL library under certain conditions as described in each
// individual source file, and distribute linked combinations
// including the two.
// You must obey the GNU General Public License in all respects
// for all of the code used other than OpenSSL.  If you modify
// file(s) with this exception, you may extend this exception to your
// version of the file(s), but you are not obligated to do so.  If you
// do not wish to do so, delete this exception statement from your
// version.  If you delete this exception statement from all source
// files in the program, then also delete it here.

// Retrieve the proxy configuration from Gnome.

//import subprocess


const GSETTINGS_CMDLINE = "gsettings list-recursively org.gnome.system.proxy";
const CANNOT_PARSE_WARNING = "Cannot parse gsettings value: %r";

function parse_proxy_hostspec(hostspec) {
    //Parse the hostspec to get protocol, hostname, username and password.
    let protocol = null;
    let username = null;
    let password = null;
    let hostname = hostspec;
    if ("://" in hostname) {
        [protocol, hostname] = hostname.split("://", 1);
    }
    if ("@" in hostname) {
        [username, hostname] = hostname.rsplit("@", 1);
        if (":" in username) {
            [username, password] = username.split(":", 1);
        }
    }
    return [protocol, hostname, username, password];
}

function proxy_url_from_settings(scheme, gsettings) {
    //Build and return the proxy URL for the given scheme, based on the gsettings.
    let [protocol, host, username, pwd] = parse_proxy_hostspec(gsettings[scheme + ".host"]);
    // if the user did not set a proxy for a type (http/https/ftp) we should
    // return None to ensure that it is not used
    if (host == '')
        return null;

    let username = null;
    let pwd = null;
    let port = gsettings[scheme + ".port"];

    if ((scheme == "http") && gsettings["http.use-authentication"]) {
        username = gsettings["http.authentication-user"];
        pwd = gsettings["http.authentication-password"];
    }

    let proxy_url = "";
    if (username != null) {
        if (pwd != null) {
            proxy_url = "%s:%s@%s:%d".format(username, pwd, host, port);
        } else {
            proxy_url = "%s@%s:%d".format(username, host, port);
        }
    } else {
        proxy_url =  "%s:%d".format(host, port);
    }
    if (protocol != null) {
        proxy_url = "%s://%s".format(protocol, proxy_url);
    }

    return proxy_url;
}

function get_proxy_settings() {
    // Parse the proxy settings as returned by the gsettings executable
    // and return a dictionary with a proxy URL for each scheme.
    let output = subprocess.check_output(GSETTINGS_CMDLINE.split());
    let gsettings = {};
    let base_len = ("org.gnome.system.proxy.").length;
    // pylint: disable=E1103
    let path, key, value, parsed_value, parsed_value;
    for (let line in output.split("\n")) {
        try {
            [path, key, value] = line.split(" ", 2);
        } catch(e) {
            continue;
        }
        if (value.startswith("'")) {
            parsed_value = value.substring(1, value.length - 1);
        } else if (value.startswith(['[', '@'])) {
            parsed_value = value;
        } else if (value in ['true', 'false']) {
            parsed_value = (value == 'true');
        } else if (value.isdigit()) {
            parsed_value = parseInt(value);
        } else {
            global.log(CANNOT_PARSE_WARNING.format(value));
            parsed_value = value;
        }
        relative_key = path + "." + key;
        relative_key = relative_key.substring(base_len, relative_key.length);
        gsettings[relative_key] = parsed_value;
    }
    let mode = gsettings["mode"];
    // If mode is automatic the PAC javascript should be interpreted
    // on each request. That is out of scope so it's ignored for now
    let settings = {};
    if (mode == "manual") {
        for (scheme in ["http", "https"]) {
            scheme_settings = proxy_url_from_settings(scheme, gsettings);
            if (scheme_settings != null)
                settings[scheme] = scheme_settings;
        }
    }
    return settings;
}
