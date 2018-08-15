// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

/* The name of this package (not localized) */
const PACKAGE_NAME = 'cinnamon';
/* The version of this package */
const PACKAGE_VERSION = '3.2.8';
/* The version of GJS we're linking to */
const GJS_VERSION = '3.2.0';
/* 1 if gnome-bluetooth is available, 0 otherwise */
const HAVE_BLUETOOTH = 1;
/* The system TLS CA list */
const CINNAMON_SYSTEM_CA_FILE = '/etc/ssl/certs/ca-certificates.crt';
/* The user folder it's relative to the user home folder */
const USER_DOMAIN_FOLDER = '.cinnamon-gnome';
/* The config folder it's relative to the USER_DOMAIN_FOLDER */
const USER_CONFIG_FOLDER = 'configs';
/* The repositories folder it's relative to the USER_DOMAIN_FOLDER */
const USER_REPOSITORIES_FOLDER = 'xlet.repositories';
/* The config folder it's relative to the USER_DOMAIN_FOLDER */
const USER_CACHE_FOLDER = 'xlet.cache';
/* The install folder it's relative to the user_data_dir folder */
const USER_INSTALL_FOLDER = 'gnome-shell';
/* The locale folder it's relative to the user_data_dir folder */
const USER_LOCALE_FOLDER = 'locale';
