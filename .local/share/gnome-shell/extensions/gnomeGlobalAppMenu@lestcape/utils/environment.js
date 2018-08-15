#!/usr/bin/gjs

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Gettext = imports.gettext;
const UUID = 'gnomeGlobalAppMenu@lestcape';
Gettext.bindtextdomain(UUID, GLib.build_filenamev([GLib.get_user_data_dir(), "locale"]));

function _(str) {
   let resultConf = Gettext.dgettext(UUID, str);
   if(resultConf != str) {
      return resultConf;
   }
   return Gettext.gettext(str);
};

function Application() {
   this._init.apply(this, arguments);
}

Application.prototype = {
   _init: function(arg) {
      this._arg = arg;
      this._credentials = new Gio.Credentials();
   },

   getArguments: function() {
      return ["-i", "-u"];
   },

   executeOption: function() {
      if(this._arg[0] == "-i") {
         return this.install();
      } else if(this._arg[0] == "-u") {
         return this.uninstall();
      }
      return false;
   },

   haveValidArguments: function() {
      return ((this._arg.length == 1) && (this.getArguments().indexOf(this._arg[0]) != -1));
   },

   printHelp: function() {
      print (_("Global Menu Environment Usage") + "\n");
      print ("    -i: " + _("Install environment variables") + "\n");
      print ("    -u: " + _("Uninstall environment variables") + "\n");
   },

   isRuningAsRoot: function() {
      return (this._credentials.get_unix_user() == 0);
   },

   install: function() {
      try {
         if(!this.isRuningAsRoot()) {
            return this._runAsRoot();
         } else {
            let env = this._getEnvironment();
            if(env && !("UBUNTU_MENUPROXY" in env)) {
               let path = "/etc/profile.d/proxy-globalmenu.sh";
               let file = Gio.file_new_for_path(path);
               if(file.get_parent().query_exists(null) && !file.query_exists(null)) {
                  let rawData =  '';
                  rawData += 'if [ "$DESKTOP_SESSION" = "gnome" ] && [ -n "$UBUNTU_MENUPROXY" ]; then\n';
                  rawData += '   UBUNTU_MENUPROXY=1\n';
                  rawData += '   export "UBUNTU_MENUPROXY=$UBUNTU_MENUPROXY"\n';
                  rawData += 'else\n';
                  rawData += '   if grep -q UBUNTU_MENUPROXY /etc/environment; then\n';
                  rawData += '      unset UBUNTU_MENUPROXY\n';
                  rawData += '   fi\n';
                  rawData += 'fi\n';


                  file.replace_contents(rawData, null, false, 0, null);
                  env["UBUNTU_MENUPROXY"] = 0;
                  this._saveEnvironment(env);
                  return true;
               }
            }
         }
      } catch(e) {}
      return false;
   },

   uninstall: function() {
      try {
         if(!this.isRuningAsRoot()) {
            return this._runAsRoot();
         } else {
            let env = this._getEnvironment();
            if(env && ("UBUNTU_MENUPROXY" in env)) {
               delete env["UBUNTU_MENUPROXY"];
               this._saveEnvironment(env);
            }
            let path = "/etc/profile.d/proxy-globalmenu.sh";
            let file = Gio.file_new_for_path(path);
            if(file.query_exists(null)) {    
               file['delete'](null);
            }
            return true;
         }
      } catch(e) {}
      return false;
   },

   _getEnvironment: function() {
      let path = "/etc/environment";
      let file = Gio.file_new_for_path(path);
      if(file.query_exists(null)) {
         let environment = {};
         let contents = file.load_contents(null)[1].toString();
         let lines = contents.split("\n");
         for(let pos in lines) {
            let line = lines[pos].trim();
            if(line.length > 0) {
               let reg = lines[pos].split("=");
               environment[reg[0]] = reg[1];
            }
         }
         return environment;
      }
      return null;
   },

   _saveEnvironment: function(env) {
      let path = "/etc/environment";
      let file = Gio.file_new_for_path(path);
      if(file.query_exists(null)) {
         let contents = "";
         for(let key in env)
            contents +=  key + "=" + env[key] + "\n";
         file.replace_contents(contents, null, false, 0, null);
      }
   },

   _runAsRoot: function() {
      if(!this.isRuningAsRoot()) {
         try {
            let file = this._getCurrentFile();
            let prgPath = file.get_path();
            let command = null;
            let resultPath = GLib.find_program_in_path("gksudo");
            if(resultPath) {
               let message = _("Please enter your password to configure the Menu Proxy environment variable");
               command = "'" + resultPath + "' \"sh -c '" + prgPath + " " + this._arg + "'\" -m '" + message + "'";
            } else {
               resultPath = GLib.find_program_in_path("pkexec");
               if(resultPath) {
                  command = "'" + resultPath + "' '" + prgPath + "' " + this._arg;
               }
            }
            if(command) {
                let sucess = this._spawn_sync(command);
                if(!sucess)
                   throw new Error(_("Could not acquire root privileges"));
                return true;
            }
         } catch(e) {}
      }
      return false;
   },

   _getCurrentFile: function () {
      let stack = (new Error()).stack;
      let stackLine = stack.split('\n')[1];
      if (!stackLine)
         throw new Error(_("Could not find current file"));

      let match = new RegExp('@(.+):\\d+').exec(stackLine);
      if (!match)
         throw new Error(_("Could not find current file"));

      let path = match[1];

      // The new gjs ES6 implementation now report also the column of the error.
      // If the column is present extract it.
      let index = path.lastIndexOf(":");
      if (index != -1) {
          path = path.substring(0, index);
      }

      let file = Gio.File.new_for_path(path);
      return file;
   },

   _spawn_sync: function(cmd) {
      try {
         let [ok, standard_output, standard_error, exit_status] =
             GLib.spawn_command_line_sync(cmd);
         return ok && (exit_status == 0);
      } catch (e) {
         throw e;
      }
      return false;
   },
};

let myapp = new Application(ARGV);
if (myapp.haveValidArguments()) {
   let result = myapp.executeOption();
   print("" + result);
} else {
   myapp.printHelp();
}
