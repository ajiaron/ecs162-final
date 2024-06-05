# Microblog
MicroBlog is a simple blogging platform designed for educational purposes. This application allows users to register, log in, create posts, like other users' posts, and delete their own posts.

Features List:

Main Page — Status: Complete
1. Posts are visible to the user whether they are logged in or not.
2. The create post form is visible to the user only when they are authenticated.
3. The navigation header and footer are properly fixed to the viewport.

Navigation — Status: Complete
1. The navigation bar conditionally renders the generated avatar based on the user’s username if they are authenticated.
2. The navigation bar is responsive for smaller screen sizes, opening a navigation pane if the screen is below a certain width.
3. Profile and logout buttons are rendered conditionally based on the state of the user’s authentication.
4. Home button is implemented regardless of authentication.

User Login / Register / Logout — Status: Complete
1. Login and Register UI is completed and responsive, with an extra field for passwords.
2. Register functionality is implemented, creating a new user and redirecting to the homepage.
3. Login functionality is implemented, updating the state of the user’s session.
4. Logout functionality is implemented, accessible through the navbar. This serves to clear the user’s session.

Create Post Form / Emoji Panel — Status: Complete
1. Authenticated users can create and add posts to the feed with a title and content field through a POST request.
2. Emoji search, display, and insertion is fully implemented with an additional loading text before the API call is fulfilled.
3. API keys are properly stored in a .env file and included in a .gitignore for proper security.

Post Component — Status: Complete
1. Post UI is completed with the post owner’s avatar, username, time of creation, like count, like button, delete button, title, and caption.
2. Like functionality is fully implemented, while also keeping track of the user’s ID so that the user can also unlike the post.
3. Delete functionality is fully implemented, only available to the ID of the owner of the post.
4. Posts are displayed in reverse chronological order, with newest posts appearing at the top of the feed.

Profile — Status: Complete
1. The user’s info is properly displayed at the top of the page, with the user’s avatar, username, and date of account creation.
2. The user’s posts are displayed in a list if any exist, otherwise a text is displayed indicating that they have no posts.
3. Posts can be deleted from the profile page.


Future Implementations —
1. Additional view for the post component which will render the usernames of those who have liked the post.
2. Edit post feature that would allow users to update the title and content of their posts.
3. Password field validation for authentication when we implement SQL databases.
4. Profile pages for other users, possibly through a url parameter like `/profile/:username`.
5. Error notifications if the title and caption field is left empty during post creation.
6. Verify that the user is authenticated before allowing the user to like posts.


** to run the application locally, run `node server.js` or optionally, user `nodemon server.js` for auto refreshes in development.
