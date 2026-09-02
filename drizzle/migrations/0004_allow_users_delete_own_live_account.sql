-- Disconnecting a broker must remove its account row, not leave a zeroed/stale one behind.
CREATE POLICY "Users can delete their own live accounts"
ON public.live_account
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);