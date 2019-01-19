if (get_application_name()=="Firefox") then
	if (get_window_class()=="Nightly") then
			if (get_window_role()=="toolbox") then
			set_window_geometry(400, 240, 1100, 700);
			end
			if (get_window_role()=="browser") then
			set_window_geometry(15, 50, 1170, 990); 
			end
	end
	if (get_window_class()=="Firefox") then
			if (get_window_role()=="browser") then
			set_window_geometry(30, 50, 1600, 970);
			end 
	end
	--else set_window_position(30, 50); end
end

