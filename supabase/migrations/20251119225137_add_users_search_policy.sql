/*
  # Add users search policy

  1. Changes
    - Add new RLS policy to allow authenticated users to search and view other users
    - This enables user search functionality for friend requests and direct messages
  
  2. Security
    - Only authenticated users can search
    - Users can view username and email of other users for search purposes
*/

CREATE POLICY "Authenticated users can search other users"
  ON users FOR SELECT
  TO authenticated
  USING (true);
