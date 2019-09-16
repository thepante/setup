/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */

const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = imports.misc.extensionUtils.getCurrentExtension();
/**
 * initTranslations:
 * @domain: (optional): the gettext domain to use
 *
 * Initialize Gettext to load translations from extensionsdir/locale.
 * If @domain is not provided, it will be taken from metadata['gettext-domain']
 */
function initTranslations(domain) {
  const LocaleDir = Me.dir.get_child('locale');
  domain = domain || Me.metadata['gettext-domain'];

  // check if this extension was built with "make zip-file", and thus
  // has the locale files in a subfolder
  // otherwise assume that extension has been installed in the
  // same prefix as gnome-shell
  if (LocaleDir.query_exists(null))
    Gettext.bindtextdomain(domain, LocaleDir.get_path());
  else
    Gettext.bindtextdomain(domain, Config.LOCALEDIR);
}

/**
 * initIcons:
 *
 * Initialize Gtk to load icons from extensionsdir/icons.
 */
function initIcons() {
  const Theme = Gtk.IconTheme.get_default();
  const IconDir = Me.dir.get_child('icons');
  if(IconDir.query_exists(null))
    Theme.append_search_path(IconDir.get_path());
}

/**
 * getSettings:
 * @schema: (optional): the GSettings schema id
 *
 * Builds and return a GSettings schema for @schema, using schema files
 * in extensionsdir/schemas. If @schema is not provided, it is taken from
 * metadata['settings-schema'].
 */
function getSettings(schema) {
  schema = schema || Me.metadata['settings-schema'];

  const GioSSS = Gio.SettingsSchemaSource;

  // check if this extension was built with "make zip-file", and thus
  // has the schema files in a subfolder
  // otherwise assume that extension has been installed in the
  // same prefix as gnome-shell (and therefore schemas are available
  // in the standard folders)
  const SchemaDir = Me.dir.get_child('schemas');
  let schemaSource;
  if (SchemaDir.query_exists(null))
    schemaSource = GioSSS.new_from_directory(
      SchemaDir.get_path(),
      GioSSS.get_default(),
      false
    );
  else
    schemaSource = GioSSS.get_default();

  const SchemaObj = schemaSource.lookup(schema, true);
  if (!SchemaObj)
    throw new Error('Schema ' + schema + ' could not be found for extension '
            + Me.metadata.uuid + '. Please check your installation.');

  return new Gio.Settings({ settings_schema: SchemaObj });
}
