require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 3000;
const saltRounds = 10;
// middleware
app.use(cors());
app.use(express.json());

var admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  console.log("Authorization header:", token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const verifyAdmin = async (req, res, next) => {
  const user = await userCollection.findOne({ email: req.email });
  if (user?.role !== "admin") {
    return res.status(403).send({ message: "Admin only" });
  }
  next();
};

const uri = process.env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
app.get("/", (req, res) => {
  res.send("Decoration server is running");
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const decorationDb = client.db("decorationDB");
    const userCollection = decorationDb.collection("users");
    const googleUserCollection = decorationDb.collection("googleusers");
    const servicesCollection = decorationDb.collection("services");
    const decoratorsCollection = decorationDb.collection("decorators");
    const bookingsCollection = decorationDb.collection("bookings");
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const hashedPassword = await bcrypt.hash(user?.password, saltRounds);
        user.password = hashedPassword;
        console.log(user);
        user.role = "user";
        user.createdAt = new Date();
        const email = req.body.email;
        const query = { email: email };
        const existingUser = await userCollection.findOne(query);

        if (existingUser) {
          res.send({
            message: "user already exits. do not need to insert again",
          });
        } else {
          const result = await userCollection.insertOne(user);
          res.status(201).json(result);
        }
      } catch (err) {
        res.status(500).json({ message: "Failed to save user" });
      }
    });
    app.post("/googleUsers", async (req, res) => {
      try {
        const guser = req.body;
        console.log(guser);
        guser.role = "user";
        guser.createdAt = new Date();
        const email = req.body.email;
        const query = { email: email };
        const existingUser = await userCollection.findOne(query);

        if (existingUser) {
          res.send({
            message: "user already exits. do not need to insert again",
          });
        } else {
          const result = await googleUserCollection.insertOne(guser);
          const result2 = await userCollection.insertOne(guser);
          res.status(201).json(result);
        }
      } catch (err) {
        res.status(500).json({ message: "Failed to save user" });
      }
    });
    app.get("/googleUsers", async (req, res) => {
      res.send("Hello from google users post");
    });

    app.post("/login", async (req, res) => {
      const { email, password } = req.body;

      try {
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(401).send({ message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).send({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
          { email: user.email, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );

        res.send({
          token,
          user: {
            email: user.email,
            role: user.role,
          },
        });
      } catch (err) {
        res.status(500).send({ message: "Login failed" });
      }
    });

    app.get("/services", async (req, res) => {
      try {
        const services = await servicesCollection.find().toArray();
        res.send(services);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch services" });
      }
    });
    app.get("/services/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const service = await servicesCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send(service);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch service" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
app.listen(port, () => {
  console.log(`Decoration server is running on port: ${port}`);
});
