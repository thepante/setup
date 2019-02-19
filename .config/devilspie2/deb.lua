debug_print("--------------------------------------------");
x, y, width, height = get_window_geometry();

debug_print("XID:               " .. get_window_xid())
debug_print("Window Name:       " .. get_window_name());
debug_print("Application name:  " .. get_application_name())
debug_print("Window Class:      " .. get_window_class())
debug_print("Window type:       " .. get_window_type())
debug_print("Window role:       " .. get_window_role())
debug_print("Class inst. name:  " .. get_class_instance_name())
debug_print("Window geometry    " .. "X: "..x..", Y: "..y..", width: "..width..", height: "..height);

debug_print()
