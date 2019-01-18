if (get_application_name()=="Firefox") then
	if (get_window_class()=="Nightly") then
			if (get_window_name()=="Save As") then
				set_window_size(488, 280);
			end
			if (get_window_class()>="Devtools") then
			set_window_geometry(400, 240, 1100, 700);
			-- set_window_position(800, 240);
			
			else
			set_window_geometry(15, 50, 1170, 990); end
	end
	if (get_window_class()=="Firefox") then
		set_window_geometry(30, 50, 1600, 970); 
	end

	--else set_window_position(30, 50); end
end

