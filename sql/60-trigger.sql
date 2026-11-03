-- New projects only: create the profile when an account is created.
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
