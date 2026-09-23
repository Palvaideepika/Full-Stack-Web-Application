require("dotenv").config();

const express = require("express");
const morgan = require("morgan");
const NodeCache = require("node-cache");
const Redis = require("ioredis");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const User = require("./models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

const PORT = 3000;


// ===============================
// SERVER-SIDE CACHE
// ===============================

const cache = new NodeCache({
    stdTTL: 60
});


// ===============================
// REDIS CONNECTION
// ===============================

const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
        return Math.min(times * 1000, 5000);
    }
});

redis.on("connect", () => {
    console.log("Redis connection established");
});

redis.on("ready", () => {
    console.log("Redis connected successfully");
});

redis.on("error", (error) => {
    console.error("Redis connection error:", error.message);
});


// ===============================
// BACKGROUND JOB PROCESSOR
// ===============================

async function processBackgroundJob(jobData) {

    const job = {
        data: jobData,
        createdAt: new Date().toISOString()
    };

    try {

        if (redis.status !== "ready") {
            await redis.connect();
        }

        await redis.lpush(
            "backgroundJobs",
            JSON.stringify(job)
        );

        console.log(
            "Background job added to Redis"
        );

        return job;

    } catch (error) {

        console.error(
            "Redis background job error:",
            error.message
        );

        throw error;
    }
}



// ===============================
// MONGODB CONNECTION
// ===============================

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log("MongoDB connected successfully");
    })
    .catch((error) => {
        console.error(
            "MongoDB connection error:",
            error
        );
    });


// ===============================
// TEMPORARY STORAGE
// ===============================

const submissions = [];


// ===============================
// MIDDLEWARE
// ===============================

app.set("view engine", "ejs");

app.use(
    express.urlencoded({
        extended: true
    })
);

app.use(express.json());

app.use(express.static("public"));


// Logging middleware
app.use(morgan("dev"));


// ===============================
// RATE LIMITING
// ===============================

const apiLimiter = rateLimit({

    windowMs: 1 * 60 * 1000,

    max: 30,

    message: {
        error:
            "Too many requests. Please try again later."
    },

    standardHeaders: true,

    legacyHeaders: false

});


// ===============================
// HOME PAGE
// ===============================

app.get("/", (req, res) => {

    res.render("index", {
        message: null
    });

});


// ===============================
// USER REGISTRATION
// ===============================

app.post(
    "/api/register",
    async (req, res) => {

        try {

            console.log(
                "Registration request received"
            );

            const {
                name,
                email,
                password
            } = req.body;


            if (
                !name ||
                !email ||
                !password
            ) {

                return res.status(400).json({

                    error:
                        "Name, email and password are required."

                });

            }


            const existingUser =
                await User.findOne({
                    email: email
                });


            if (existingUser) {

                return res.status(400).json({

                    error:
                        "User with this email already exists."

                });

            }


            const hashedPassword =
                await bcrypt.hash(
                    password,
                    10
                );


            const newUser =
                new User({

                    name: name,

                    email: email,

                    password:
                        hashedPassword

                });


            await newUser.save();


            console.log(
                "User registered successfully:",
                email
            );


            return res.status(201).json({

                message:
                    "User registered successfully."

            });


        } catch (error) {

            console.error(
                "Registration error:",
                error
            );


            return res.status(500).json({

                error:
                    "Server error during registration."

            });

        }

    }
);


// ===============================
// JWT AUTHENTICATION MIDDLEWARE
// ===============================

function authenticateToken(
    req,
    res,
    next
) {

    const authHeader =
        req.headers["authorization"];


    const token =
        authHeader &&
        authHeader.split(" ")[1];


    if (!token) {

        return res.status(401).json({

            error:
                "Access denied. No token provided."

        });

    }


    jwt.verify(

        token,

        process.env.JWT_SECRET,

        (error, user) => {

            if (error) {

                return res.status(403).json({

                    error:
                        "Invalid or expired token."

                });

            }


            req.user = user;

            next();

        }

    );

}


// ===============================
// USER LOGIN
// ===============================

app.post(
    "/api/login",
    async (req, res) => {

        try {

            const {
                email,
                password
            } = req.body;


            if (
                !email ||
                !password
            ) {

                return res.status(400).json({

                    error:
                        "Email and password are required."

                });

            }


            const user =
                await User.findOne({
                    email: email
                });


            if (!user) {

                return res.status(401).json({

                    error:
                        "Invalid email or password."

                });

            }


            const passwordMatch =
                await bcrypt.compare(
                    password,
                    user.password
                );


            if (!passwordMatch) {

                return res.status(401).json({

                    error:
                        "Invalid email or password."

                });

            }


            const token =
                jwt.sign(

                    {
                        userId:
                            user._id,

                        email:
                            user.email
                    },

                    process.env.JWT_SECRET,

                    {
                        expiresIn:
                            "1h"
                    }

                );


            return res.json({

                message:
                    "Login successful.",

                token:
                    token

            });


        } catch (error) {

            console.error(
                "Login error:",
                error
            );


            return res.status(500).json({

                error:
                    "Server error during login."

            });

        }

    }
);


// ===============================
// BACKGROUND JOB API
// ===============================

app.post(
    "/api/background-job",
    async (req, res) => {

        try {

            const jobData =
                req.body;


            if (
                !jobData ||
                Object.keys(jobData).length === 0
            ) {

                return res.status(400).json({

                    error:
                        "Job data is required."

                });

            }


            const job =
                await processBackgroundJob(
                    jobData
                );


            return res.status(201).json({

                message:
                    "Background job added successfully.",

                job:
                    job

            });


        } catch (error) {

            console.error(
                "Background job error:",
                error.message
            );


            return res.status(503).json({

                error:
                    "Unable to add background job.",

                details:
                    error.message

            });

        }

    }
);


// ===============================
// VIEW BACKGROUND JOBS
// ===============================

app.get(
    "/api/background-jobs",
    async (req, res) => {

        try {

            if (
                redis.status !== "ready"
            ) {

                return res.status(503).json({

                    error:
                        "Redis is not ready."

                });

            }


            const jobs =
                await redis.lrange(
                    "backgroundJobs",
                    0,
                    9
                );


            const parsedJobs =
                jobs.map(
                    (job) => {

                        try {

                            return JSON.parse(
                                job
                            );

                        } catch {

                            return job;

                        }

                    }
                );


            res.json({

                count:
                    parsedJobs.length,

                jobs:
                    parsedJobs

            });


        } catch (error) {

            console.error(
                "Background jobs error:",
                error.message
            );


            res.status(500).json({

                error:
                    "Unable to retrieve background jobs."

            });

        }

    }
);


// ===============================
// EXTERNAL API INTEGRATION
// ===============================

app.get(
    "/api/external-posts",
    apiLimiter,
    async (req, res) => {

        // Check server-side cache
        const cachedPosts =
            cache.get(
                "externalPosts"
            );


        if (cachedPosts) {

            return res.json({

                source:
                    "Cache",

                posts:
                    cachedPosts

            });

        }


        try {

            const response =
                await fetch(
                    "https://jsonplaceholder.typicode.com/posts?_limit=5"
                );


            if (!response.ok) {

                return res.status(
                    response.status
                ).json({

                    error:
                        "External API request failed."

                });

            }


            const data =
                await response.json();


            // Store result in cache
            cache.set(
                "externalPosts",
                data
            );


            res.json({

                source:
                    "JSONPlaceholder",

                posts:
                    data

            });


        } catch (error) {

            console.error(
                "External API error:",
                error
            );


            res.status(500).json({

                error:
                    "Unable to connect to external API."

            });

        }

    }
);


// ===============================
// GET ALL SUBMISSIONS
// ===============================

app.get(
    "/api/submissions",
    authenticateToken,
    (req, res) => {

        res.json(
            submissions
        );

    }
);


// ===============================
// ADD SUBMISSION
// ===============================

app.post(
    "/api/submissions",
    (req, res) => {

        const {
            name,
            email
        } = req.body;


        if (
            !name ||
            !email
        ) {

            return res.status(400).json({

                error:
                    "Name and email are required."

            });

        }


        const newSubmission = {

            id:
                submissions.length + 1,

            name:
                name,

            email:
                email

        };


        submissions.push(
            newSubmission
        );


        res.status(201).json(
            newSubmission
        );

    }
);


// ===============================
// UPDATE SUBMISSION
// ===============================

app.put(
    "/api/submissions/:id",
    (req, res) => {

        const id =
            parseInt(
                req.params.id
            );


        const {
            name,
            email
        } = req.body;


        const submission =
            submissions.find(
                item =>
                    item.id === id
            );


        if (!submission) {

            return res.status(404).json({

                error:
                    "Submission not found."

            });

        }


        if (name) {

            submission.name =
                name;

        }


        if (email) {

            submission.email =
                email;

        }


        res.json(
            submission
        );

    }
);


// ===============================
// DELETE SUBMISSION
// ===============================

app.delete(
    "/api/submissions/:id",
    (req, res) => {

        const id =
            parseInt(
                req.params.id
            );


        const index =
            submissions.findIndex(
                item =>
                    item.id === id
            );


        if (index === -1) {

            return res.status(404).json({

                error:
                    "Submission not found."

            });

        }


        const deletedSubmission =
            submissions.splice(
                index,
                1
            );


        res.json({

            message:
                "Submission deleted successfully.",

            submission:
                deletedSubmission[0]

        });

    }
);


// ===============================
// HTML FORM SUBMISSION
// ===============================

app.post(
    "/submit",
    (req, res) => {

        const {
            name,
            email
        } = req.body;


        if (
            !name ||
            !email
        ) {

            return res.render(
                "index",
                {

                    message:
                        "Please enter both name and email."

                }
            );

        }


        if (
            !email.includes("@")
        ) {

            return res.render(
                "index",
                {

                    message:
                        "Please enter a valid email address."

                }
            );

        }


        submissions.push({

            name:
                name,

            email:
                email

        });


        res.render(
            "index",
            {

                message:
                    `Thank you ${name}! Your email ${email} was submitted successfully.`

            }
        );

    }
);


// ===============================
// START SERVER
// ===============================

app.listen(
    PORT,
    () => {

        console.log(
            `Server running at http://localhost:${PORT}`
        );

    }
);