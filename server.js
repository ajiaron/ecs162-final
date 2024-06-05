const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const canvas = require('canvas');
const passport = require('passport');
const crypto = require('crypto');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const fs = require('fs');
const path = require('path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
require('dotenv').config();
const STRIPE_KEY = process.env.STRIPE_KEY
const EMOJI_API_URL = process.env.EMOJI_API_URL;
const API_KEY = process.env.EMOJI_API_KEY;
const CLIENT_ID = process.env.TEST_CLIENT_ID;
const CLIENT_SECRET = process.env.TEST_CLIENT_SECRET;
const DB_FILEPATH = process.env.DB_FILEPATH;
const stripe = require('stripe')(STRIPE_KEY);
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = 3000;

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Handlebars Helpers

    Handlebars helpers are custom functions that can be used within the templates 
    to perform specific tasks. They enhance the functionality of templates and 
    help simplify data manipulation directly within the view files.

    In this project, two helpers are provided:
    
    1. toLowerCase:
       - Converts a given string to lowercase.
       - Usage example: {{toLowerCase 'SAMPLE STRING'}} -> 'sample string'

    2. ifCond:
       - Compares two values for equality and returns a block of content based on 
         the comparison result.
       - Usage example: 
            {{#ifCond value1 value2}}
                <!-- Content if value1 equals value2 -->
            {{else}}
                <!-- Content if value1 does not equal value2 -->
            {{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

// Database configuration
let db;
async function initializeDB() {
    db = await sqlite.open({ filename: `./${DB_FILEPATH}.db`, driver: sqlite3.Database });
}
initializeDB().catch(err => {
    console.error('Error initializing database:', err);
});

passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, (token, tokenSecret, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    const hashedGoogleId = createHash(user.id);
    done(null, hashedGoogleId); // Store hashed Google ID in session
});

passport.deserializeUser(async (hashedGoogleId, done) => {
    try {
        done(null, hashedGoogleId);
    } catch (err) {
        console.error('Deserialization error:', err);
        done(err, null);
    }
});

// Set up Handlebars view engine with custom helpers

app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
            json: function (context) {
                return JSON.stringify(context);
            },    
        },
        partialsDir: path.join(__dirname, 'views/partials')
    })
);

app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.use(
    session({
        secret: 'oneringtorulethemall',     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    res.locals.appName = 'MicroBlog';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    res.locals.user = req.user || null;
    next();
});
app.use('/static', express.static(path.join(__dirname, 'public')));

app.use(express.static(__dirname + '/public'));
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
app.get('/', async (req, res) => {
    try {
        const posts = await db.all('SELECT * FROM posts ORDER BY timestamp DESC');
        const user = await getCurrentUser(req) || {};
        res.render('home', { posts, user });
    } catch (err) {
        console.error(err);
        res.status(500).send('An error occurred while retrieving posts');
    }
});
app.get('/donate/:username', async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        const account = await hasAccountLink(req.params.username);
        res.render('donate', {user, profile:req.params.username, accountid:account.stripe_account_link})
    } catch (err) {
        console.log(err)
        res.status(500).send('An error occurred while rendering donation page');
    }
})
app.get('/confirmation/:username', async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        res.render('confirmation', {user, profile:req.params.username})
    } catch (err) {
        console.log(err)
        res.status(500).send('An error occurred while rendering donation page');
    }
})

app.get('/testusers', async (req, res) => {
    try {
        const users = await db.all('SELECT * FROM users')
        res.send(users)
    } catch (err) {
        console.error(err)
        res.status(500).send('An error occurred while retrieving posts');
    }
})

app.get('/testposts', async (req, res) => {
    try {
        const posts = await db.all('SELECT * FROM posts ORDER BY timestamp DESC')
        res.send(posts)
    } catch (err) {
        console.error(err)
        res.status(500).send('An error occurred while retrieving posts');
    }
})

app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login', failureMessage: true }),
    async (req, res) => {
        if (req.authInfo) {
            const hashedGoogleId = createHash(req.user.id);
            req.session.googleHash = hashedGoogleId;
            const user = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [hashedGoogleId]);
            if (user) {
                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.avatarUrl = user.avatar_url;
                req.session.memberSince = user.memberSince;
                req.session.loggedIn = true; 
                req.user = user;
                res.redirect('/');
            } else {
                res.redirect('/registerUsername');
            }
        } else {
            console.log("google auth failed")
            res.redirect('/login');
        }
    }
);

app.get('/registerUsername', (req, res) => {
    if (!req.session.googleHash) {
        return res.redirect('/login');
    }
    res.render('registerUsername');
});

app.post('/registerUsername', async (req, res) => {
    try {
        const { username } = req.body;
        const googleHash = req.session.googleHash;
        const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return res.render('registerUsername', { regError: 'Username already taken' });
        }
        const letter = username.charAt(0).toUpperCase();
        const avatarBuffer = generateAvatar(letter);
        const avatarFileName = `${username}_avatar.png`;
        const avatarDirectory = path.join(__dirname, 'public','avatars');
        if (!fs.existsSync(avatarDirectory)) {
            fs.mkdirSync(avatarDirectory);
        }
        const avatarFilePath = path.join(avatarDirectory, avatarFileName);
        fs.writeFileSync(avatarFilePath, avatarBuffer)
        const avatarUrl = `/avatars/${avatarFileName}`;
    
        await db.run('INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
            [username, googleHash, avatarUrl, getCurrentDate()]);
            
        const newUser = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [googleHash]);
        req.session.userId = newUser.id;
        req.session.username = newUser.username;
        req.session.avatarUrl = newUser.avatar_url;
        req.session.memberSince = newUser.memberSince;
        req.session.loggedIn = true; 
        req.user = newUser;
        res.redirect('/');
    } catch (err) {
        console.error('Error during registration:', err);
        res.render('registerUsername', { regError: 'An error occurred during registration. Please try again.' });
    }
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout Error:', err);
            return res.redirect('/error');
        }
        req.session.destroy((err) => {
            if (err) {
                console.error('Session Destruction Error:', err);
                return res.redirect('/error');
            }
            res.render('logout'); 
        });
    });
});

app.get('/logoutCallback', (req, res) => {
    res.redirect('/');
});

// Register GET route is used for error response from registration
app.get('/register', (req, res) => {
    res.render('loginRegister', { regError: req.query.error });
});

// Login route GET route is used for error response from login
app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

// Error route: render error page
app.get('/error', (req, res) => {
    res.render('error');
});

// Additional routes that you must implement
app.get('/emojis', async (req, res) => {
    try {
        const emojis = await fetchEmojis();
        res.json(emojis);
    } catch(e) {
        res.status(500).send('An error occurred while retrieving emojis');
    }
});

// for sorting
app.get('/posts/render', async (req, res) => {
    try {
        let posts = []
        const sortBy = req.query.sortBy || 'timestamp';
        const order = req.query.order === 'ascending' ? 'ASC' : 'DESC';
        const profile = req.query.profile;
        const currentUser = await getCurrentUser(req)
        // sorting user posts or feed posts
        if (profile) {
            posts = await db.all(`SELECT * FROM posts WHERE username = ? ORDER BY ${sortBy} ${order}`, [profile]);
        } else {
            posts = await db.all(`SELECT * FROM posts ORDER BY ${sortBy} ${order}`);
        }
        let html = '';
        for (const post of posts) {
            html += await new Promise((resolve, reject) => {
                res.render('partials/post', { ...post, user: currentUser, layout: false, isLogged: currentUser}, (err, renderedHtml) => {
                    if (err) return reject(err);
                    resolve(renderedHtml);
                });
            });
        }
        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('An error occurred while retrieving posts');
    }
});

app.post('/posts', (req, res) => {
    createPost(req, res)
});

app.post('/like/:id', (req, res) => {
    updatePostLikes(req, res)
});

app.get('/profile/:username', isAuthenticated, (req, res) => {
    renderProfile(req, res)
});

app.get('/avatar/:username', (req, res) => {
    handleAvatar(req, res)
});

app.post('/delete/:id', isAuthenticated, (req, res) => {
    deletePost(req, res)
});

app.post('/api/accountlink', async (req, res) => {
    const accountid = req.body.accountid
    const campaignname = req.body.campaignname
    stripe.accountLinks.create({
        account: accountid, 
        refresh_url: 'http://localhost:3000/',
        return_url: `http://localhost:3000/profile/${campaignname}`,
        type: 'account_onboarding',
    }, (stripeError, accountLink)=> {
        if (stripeError) {
            return res.status(500).json({ error: "Failed to create account link" });
        }       
        if (accountLink.url) {
            handleLink(req, res, accountLink)
        } else {
            res.status(500).json({ error: 'Failed to create account link' });
        }  
        res.json(accountLink);
    })
});

app.get('/api/checkaccountlink', async (req, res) => {
    const campaignname = req.query.campaignname
    try {
        const hasLink = await hasAccountLink(campaignname)
        if (hasLink) {
            res.json(hasLink)
        } else {
            res.json(false)
        }
    } catch(e) {
        console.log(e)
    }
});

app.get('/dashboard-link', async (req, res) => {
    const accountid = req.query.accountid
    const campaignname = req.query.campaignname
    try {
        if (accountid) {
            const account = await stripe.accounts.retrieve(accountid)
            if (account.details_submitted) {
                const loginLink = await stripe.accounts.createLoginLink(accountid);
                if (loginLink.url) {
                    res.json({ success: true, url: loginLink.url });
                } else {
                    res.status(500).json({ error: 'Failed to create login link' });
                }
            } else {
                const accountLink = await stripe.accountLinks.create({
                    account: accountid,
                    refresh_url: 'http://localhost:3000/',
                    return_url: `http://localhost:3000/profile/${campaignname}`,
                    type: 'account_onboarding',
                });
                if (accountLink.url) {
                    res.json({ success: true, url: accountLink.url });
                } else {
                    res.status(500).json({ error: 'Failed to create account link' });
                }
            } 
        } else {
            res.status(400).json({ error: 'User not found or Stripe account link missing' });
        }
    } catch (err) {
        console.error('Error generating dashboard link:', err);
        res.status(500).json({ error: 'An error occurred while generating dashboard link' });
    }
});

// for payment
app.post('/api/createintent', async(req, res) => {
    const amount = req.body.amount
    const accountid = req.body.accountid
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: 'usd',
            automatic_payment_methods: {
              enabled: true,
            },
            transfer_data: {
              destination: accountid,
            },
          });
          res.json({client_secret: paymentIntent.client_secret});
    } catch(e) {
        res.status(500).json({ error: "Failed to create payment intent" });
    }
})

app.post('/api/createaccount', async (req, res) => {
    try {
        const account = await stripe.accounts.create({
            type: 'express',
        });
        res.json(account);
    } catch (error) {
        res.status(500).json({ error: "Failed to create account link" });
    }
});

// comments
app.post('/comments/:postId', async (req, res) => {
    const postId = req.params.postId;
    const { comment } = req.body;
    const username = req.session.username;
    try {
        await db.run('INSERT INTO comments (post_id, username, comment) VALUES (?, ?, ?)', [postId, username, comment]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error adding comment:', err);
        res.status(500).json({ success: false, error: 'An error occurred while adding the comment' });
    }
});

app.get('/comments/:postId', async (req, res) => {
    const postId = req.params.postId;

    try {
        const comments = await db.all('SELECT * FROM comments WHERE post_id = ?', [postId]);
        res.json({ comments });
    } catch (err) {
        console.error('Error fetching comments:', err);
        res.status(500).json({ error: 'An error occurred while fetching comments' });
    }
});

app.delete('/deleteUser/:username', async (req, res) => {
    const username = req.params.username;
    const result = await deleteUser(username);
    if (result.success) {
        res.status(200).send(result.message);
    } else {
        res.status(500).send(result.message);
    }
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Function to render the profile page
async function renderProfile(req, res) {
    try {
        const user = await getCurrentUser(req);
        const profile = await getCurrentProfile(req);
        const hasCampaign = await hasAccountLink(req.params.username);
        const paymentEnabled = hasCampaign ? await confirmAccount(hasCampaign.stripe_account_link):false;
        if (!user) {
            return res.redirect('/login');
        }
        const userPosts = await db.all('SELECT * FROM posts WHERE username = ? ORDER BY timestamp DESC', [profile.username]);
        res.render('profile', { user, profile, posts: userPosts, isOwner: user.username === profile.username?true:false, hasCampaign, paymentEnabled });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while displaying the profile' });
    }
}

// Function to update post likes
async function updatePostLikes(req, res) {
    const postId = parseInt(req.params.id, 10)
    try {
        const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);
        if (post) {
            const newLikes = post.likes + 1;
            await db.run('UPDATE posts SET likes = ? WHERE id = ?', [newLikes, postId]);
            res.status(200).json({ success: true, likes: newLikes });
        } else {
            res.status(404).json({ error: 'Post not found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while updating likes' });
    }
}

// Function to handle avatar generation and serving
function handleAvatar(req, res) {
    const username = req.params.username
    res.send(generateAvatar(username.charAt(0).toLowerCase()))
}

// Function to get the current user from session
async function getCurrentUser(req) {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [req.session.username]);
    return user;
}

// Function to get the owner of the viewed profile
async function getCurrentProfile(req) {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [req.params.username]);
    return user;
}

// Function to get all posts
async function getPosts() {
    try {
        const posts = await db.all('SELECT * FROM posts ORDER BY timestamp DESC');
        if (posts) {
            return posts
        } else {
            console.log("could not retrieve posts")
        }
    } catch(err) {
        res.status(500).json({ error: 'An error occurred while updating likes' });
    }
}

// helper function to create a new post
async function createPost(req, res) {
    try {
        const { title, content } = req.body;
        const user = await getCurrentUser(req);
        if (!title || !content) {
            return res.render('home', { posts: getPosts(), user, error: 'Title and content are required.' });
        }
        if (!user) {
            return res.render('loginRegister', { loginError: 'You must be logged in to create a post.' });
        }
        const newPost = {
            title: title,
            content: content,
            username: user.username,
            timestamp: getCurrentDate(),
            likes: 0
        };
        await db.run('INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)',
            [newPost.title, newPost.content, newPost.username, newPost.timestamp, newPost.likes]);
        res.redirect('/');
    } catch (err) {
        res.status(500).json({ error: 'An error occurred while creating posts' });
    }
}

// Function to generate an image avatar
function generateAvatar(letter, width = 100, height = 100) {
    // Steps:
    // 1. Choose a color scheme based on the letter
    // 2. Create a canvas with the specified width and height
    // 3. Draw the background color
    // 4. Draw the letter in the center
    // 5. Return the avatar as a PNG buffer
    const colors = {
        A: '#217CE5', B: '#FF8C00', C: '#B8860B', D: '#556B2F', E: '#2E8B57',
        F: '#008B8B', G: '#4682B4', H: '#6A5ACD', I: '#483D8B', J: '#8A2BE2',
        K: '#A020F0', L: '#C71585', M: '#B22222', N: '#CD5C5C', O: '#8B4513',
        P: '#8B0000', Q: '#2F4F4F', R: '#008080', S: '#006400', T: '#4B0082',
        U: '#8B008B', V: '#8B3E2F', W: '#4B4B4B', X: '#556B2F', Y: '#6B8E23',
        Z: '#3A3A3A'
    };
    const backgroundColor = colors[letter.toUpperCase()] || '#000000'; 
    const canvasObj = canvas.createCanvas(width, height);
    const ctx = canvasObj.getContext('2d');
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#FFF'; 
    ctx.font = `${width / 2}px DM Sans`;
    const yOffset = height / 30; // letter is slightly too high up
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter.toUpperCase(), width / 2, height / 2 + yOffset);
    return canvasObj.toBuffer('image/png');
}

// helper function to delete posts
async function deletePost(req, res) {
    const postId = parseInt(req.params.id, 10);
    try {
        const currentUser = await db.get('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        if (!currentUser) {
            return res.status(403).json({ error: 'User not found' });
        }
        const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        if (post.username !== currentUser.username) {
            return res.status(403).json({ error: 'You are not authorized to delete this post' });
        }
        await db.run('DELETE FROM posts WHERE id = ?', [postId]);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while deleting the post' });
    }
}

// helper function to format current date
function getCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); 
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// function to get emojis
async function fetchEmojis() {
    try {
        const response = await fetch(`${EMOJI_API_URL}?access_key=${API_KEY}`);
        const emojis = await response.json();
        return emojis;
    } catch (error) {
        return [];
    }
}

// function to generate google hash 
function createHash(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

// for testing purposes
async function deleteUser(username) {
    try {
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) {
            console.log('User not found');
            return { success: false, message: 'User not found' };
        }

        await db.run('DELETE FROM users WHERE username = ?', [username]);
        return { success: true, message: 'User deleted successfully' };
    } catch (err) {
        return { success: false, message: 'Error deleting user' };
    }
}

async function hasAccountLink(username) {
    try {
        const user = await db.get('SELECT stripe_account_link FROM users WHERE username = ?', [username]);
        if ( user.stripe_account_link !== null ) {
            return user
        } else {
            return false
        }
    } catch (err) {
        console.error('Error checking account link:', err);
        throw err;
    }
}

async function handleLink(req,res, accountLink) {
    const campaignname = req.body.campaignname
    try {
        const regex = /acct_[\w]+/;
        const match = accountLink.url.match(regex);
        const extractedPart = match ? match[0] : null;
        if (extractedPart) {
            await db.run('UPDATE users SET stripe_account_link = ? WHERE username = ?', [extractedPart, campaignname]);
            //res.json({ success: true, accountLink: extractedPart });
        } else {
            res.status(500).json({ error: 'Failed to extract account link part' });
        }
    } catch (e) {
        console.log(e)
    }
}

async function confirmAccount(accountid) {
    try {
        const account = await stripe.accounts.retrieve(accountid)
        if (account.details_submitted) {
            return (account.charges_enabled && account.payouts_enabled)
        } else {
            return false
        } 
    } catch(e) {
        console.log(e)
    }
}
