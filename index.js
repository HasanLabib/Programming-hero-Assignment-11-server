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
  //console.log("Authorization header:", token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    //console.log("decoded in the token", decoded);
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
       // console.log(user);
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
        //console.log(guser);
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
    app.get("/service/:id", async (req, res) => {
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
    app.delete("/services/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await servicesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to delete service" });
      }
    });
    app.post("/admin/services", verifyFBToken, async (req, res) => {
      try {
        const service = {
          ...req.body,
          createdByEmail: req.decoded_email,
          createdAt: new Date(),
        };
        const result = await servicesCollection.insertOne(service);
        res.status(201).send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to create service" });
      }
    });

    app.put("/services/edit/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;
        delete updatedData.createdByEmail;

        const result = await servicesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to update service" });
      }
    });

    app.post("/create-payment-intent", verifyFBToken, async (req, res) => {
      const information = req.body;

      //console.log(information);
    });

    app.put("/users/update/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const updatedData = req.body;
        console.log(updatedData, email);
        const result = await userCollection.updateOne(
          { email: email },
          { $set: updatedData }
        );

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to update user" });
      }
    });

    app.get("/service", async (req, res) => {
      try {
        const { search, min, max } = req.query;
        const query = {};

        if (search) {
          query.service_name = { $regex: search, $options: "i" };
        }

        if (
          (min !== undefined && min !== "") ||
          (max !== undefined && max !== "")
        ) {
          query.cost = {};
          if (min !== undefined && min !== "")
            query.cost.$gte = parseFloat(min);
          if (max !== undefined && max !== "")
            query.cost.$lte = parseFloat(max);
          if (Object.keys(query.cost).length === 0) delete query.cost;
        }

        const services = await servicesCollection.find(query).toArray();
        res.send(services);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch services" });
      }
    });

    app.post("/bookings", verifyFBToken, async (req, res) => {
      try {
        const booking = req.body;

        booking.userEmail = req.decoded_email;
        booking.createdAt = new Date();
        booking.status = "pending"; // pending by default

        const requiredFields = [
          "serviceId",
          "serviceName",
          "bookingDate",
          "location",
        ];
        for (const field of requiredFields) {
          if (!booking[field]) {
            return res.status(400).json({ message: `${field} is required` });
          }
        }

        const result = await bookingsCollection.insertOne(booking);
        res.status(201).json({
          message: "Booking created successfully",
          bookingId: result.insertedId,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to create booking" });
      }
    });

    app.get("/my-bookings", verifyFBToken, async (req, res) => {
      try {
        const bookings = await bookingsCollection
          .find({ userEmail: req.decoded_email })
          .toArray();
        res.send(bookings);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch bookings" });
      }
    });
    app.post("/bookings", verifyFBToken, async (req, res) => {
      const booking = {
        ...req.body,
        userEmail: req.decoded_email,
        status: "pending",
        paymentStatus: "unpaid",
        createdAt: new Date(),
      };

      const result = await bookingsCollection.insertOne(booking);
      res.send({ bookingId: result.insertedId });
    });

    app.get("/bookings/user/:email", verifyFBToken, async (req, res) => {
      if (req.params.email !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const bookings = await bookingsCollection
        .find({ userEmail: req.params.email })
        .toArray();

      res.send(bookings);
    });

    app.get("/users/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;

      //.log("Email Param",email,req.decoded_email)

      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const user = await userCollection.findOne({ email });

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send({ role: user.role });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (err) {
    console.error(err);
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
app.listen(port, () => {
  console.log(`Decoration server is running on port: ${port}`);
});
