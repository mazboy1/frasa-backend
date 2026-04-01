const express = require('express');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.PAYMENT_SECRET);
const jwt = require("jsonwebtoken");
const cors = require('cors');

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@frasa-id-lms.wgss7.mongodb.net/?retryWrites=true&w=majority&appName=frasa-id-lms`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// JWT Middleware (define di luar)
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  
  if (!authorization) {
    return res.status(401).send({ 
      success: false,
      message: 'No authorization token provided' 
    });
  }
  
  const token = authorization.split(' ')[1];
  
  if (!token) {
    return res.status(401).send({ 
      success: false,
      message: 'Invalid authorization format' 
    });
  }

  jwt.verify(token, process.env.ASSESS_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ 
        success: false,
        message: 'Forbidden access - Invalid token' 
      });
    }
    
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB!");

    const database = client.db("frasa-id-lms");
    const usersCollection = database.collection("users");
    const classesCollection = database.collection("classes");
    const cartCollection = database.collection("cart");
    const paymentCollection = database.collection("payment");
    const enrolledCollection = database.collection("enrolled");
    const appliedCollection = database.collection("applied");
    const feedbackCollection = database.collection("feedback");
    
    console.log("✅ All collections initialized");

    // ✅ ROLE MIDDLEWARE (define di dalam run())
    const verifyAdmin = async (req, res, next) => {
      try {
        const email = req.decoded?.email;
        
        if (!email) {
          return res.status(401).send({ 
            success: false,
            message: 'No email in token' 
          });
        }
        
        const user = await usersCollection.findOne({ email });
        
        if (!user) {
          return res.status(404).send({ 
            success: false,
            message: 'User not found in database' 
          });
        }
        
        if (user?.role === 'admin') {
          next();
        } else {
          return res.status(403).send({ 
            success: false,
            message: 'Unauthorized admin access' 
          });
        }
      } catch (error) {
        console.error('❌ Error in verifyAdmin:', error.message);
        return res.status(500).send({ 
          success: false,
          message: 'Server error during admin verification',
          error: error.message
        });
      }
    };

    const verifyInstructor = async (req, res, next) => {
      try {
        const email = req.decoded?.email;
        
        if (!email) {
          return res.status(401).send({ 
            success: false,
            message: 'No email in token' 
          });
        }
        
        const user = await usersCollection.findOne({ email });
        
        if (!user) {
          return res.status(404).send({ 
            success: false,
            message: 'User not found in database' 
          });
        }
        
        if (user?.role === 'instructor' || user?.role === 'admin') {
          next();
        } else {
          return res.status(403).send({ 
            success: false,
            message: 'Hanya instructor yang dapat mengakses fitur ini' 
          });
        }
      } catch (error) {
        console.error('❌ Error in verifyInstructor:', error.message);
        return res.status(500).send({ 
          success: false,
          message: 'Server error during instructor verification',
          error: error.message
        });
      }
    };

    // ===== ROUTES (define setelah collections ready) =====
    
    // User Routes
    app.post('/api/set-token', async (req, res) => {
      try {
        const { email, name } = req.body;
        const user = await usersCollection.findOne({ email });
        const role = user?.role || 'user';

        const tokenData = { email, name, role, iat: Math.floor(Date.now() / 1000) };
        const token = jwt.sign(tokenData, process.env.ASSESS_SECRET || "rahasia", { expiresIn: '24h' });
        
        res.send({ success: true, token, user: { email, name, role } });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get('/api/user/:email', async (req, res) => {
      try {
        const email = req.params.email;
        if (!email) {
          return res.status(400).send({ success: false, message: "Email parameter required" });
        }

        const user = await usersCollection.findOne({ email });
        
        if (!user) {
          return res.status(404).send({ success: false, message: "User tidak ditemukan di database" });
        }

        const userData = {
          _id: user._id,
          name: user.name || '',
          email: user.email,
          role: user.role || 'user',
          photoUrl: user.photoUrl || '',
          address: user.address || '',
          about: user.about || '',
          skills: user.skills || '',
          phone: user.phone || '',
          createdAt: user.createdAt || new Date()
        };

        res.send({ success: true, data: userData });
      } catch (error) {
        res.status(500).send({ success: false, message: "Server error", error: error.message });
      }
    });

    // Instructor Routes
    app.get('/api/instructors', async (req, res) => {
      try {
        const instructors = await usersCollection.find({ role: 'instructor' }).toArray();
        res.send({ success: true, data: instructors, total: instructors.length });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // ✅ KEY ENDPOINT - FIX
    app.get('/api/instructor/my-classes', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        
        if (!email || req.decoded.email !== email) {
          return res.status(403).send({ success: false, message: 'Unauthorized' });
        }

        const classes = await classesCollection.find({ instructorEmail: email }).toArray();
        res.send({ success: true, data: { classes, total: classes.length } });
      } catch (error) {
        console.error('❌ Error in my-classes:', error);
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get('/api/instructor/approved-classes', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        if (!email || req.decoded.email !== email) {
          return res.status(403).send({ success: false, message: 'Unauthorized' });
        }
        const classes = await classesCollection.find({ instructorEmail: email, status: 'approved' }).toArray();
        res.send({ success: true, data: { classes, total: classes.length } });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get('/api/instructor/pending-classes', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        if (!email || req.decoded.email !== email) {
          return res.status(403).send({ success: false, message: 'Unauthorized' });
        }
        const classes = await classesCollection.find({ instructorEmail: email, status: 'pending' }).toArray();
        res.send({ success: true, data: { classes, total: classes.length } });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get('/api/instructor/rejected-classes', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        if (!email || req.decoded.email !== email) {
          return res.status(403).send({ success: false, message: 'Unauthorized' });
        }
        const classes = await classesCollection.find({ instructorEmail: email, status: 'rejected' }).toArray();
        res.send({ success: true, data: { classes, total: classes.length } });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Class Routes
    app.post('/api/new-class', verifyJWT, verifyInstructor, async (req, res) => {
      try {
        const classData = {
          ...req.body,
          availableSeats: parseInt(req.body.availableSeats),
          price: parseFloat(req.body.price),
          status: 'pending',
          submitted: new Date(),
          totalEnrolled: 0
        };
        const result = await classesCollection.insertOne(classData);
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get('/api/classes', async (req, res) => {
      try {
        const result = await classesCollection.find({ status: 'approved' }).toArray();
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get('/api/classes-manage', async (req, res) => {
      try {
        const result = await classesCollection.find().toArray();
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get('/api/class/:id', async (req, res) => {
      try {
        const result = await classesCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!result) return res.status(404).send({ success: false, error: 'Class not found' });
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.patch('/api/change-status/:id', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const { status, reason } = req.body;
        const result = await classesCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status, reason: reason || '' } }
        );
        res.json({ success: true, data: result });
      } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' });
      }
    });

    app.put('/api/update-class/:id', verifyJWT, verifyInstructor, async (req, res) => {
      try {
        const updateDoc = { $set: req.body };
        const result = await classesCollection.updateOne(
          { _id: new ObjectId(req.params.id) }, 
          updateDoc
        );
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Cart Routes
    app.post('/api/add-to-cart', verifyJWT, async (req, res) => {
      try {
        const { classId, userMail } = req.body;
        const existingItem = await cartCollection.findOne({ classId, userMail });
        if (existingItem) {
          return res.status(400).send({ success: false, message: 'Kelas sudah ada di keranjang' });
        }
        const result = await cartCollection.insertOne({ classId, userMail, submitted: new Date() });
        res.send({ success: true, data: { insertedId: result.insertedId } });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get('/api/cart/:email', verifyJWT, async (req, res) => {
      try {
        const carts = await cartCollection.find({ userMail: req.params.email }).toArray();
        const classIds = carts.map(cart => new ObjectId(cart.classId));
        const result = await classesCollection.find({ _id: { $in: classIds } }).toArray();
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Payment Routes
    app.post('/api/create-payment-intent', async (req, res) => {
      try {
        const { price } = req.body;
        const amount = parseInt(price * 100);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ success: true, data: { clientSecret: paymentIntent.client_secret } });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Stats Routes
    app.get('/api/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const approvedClasses = await classesCollection.countDocuments({ status: 'approved' });
        const pendingClasses = await classesCollection.countDocuments({ status: 'pending' });
        const instructors = await usersCollection.countDocuments({ role: 'instructor' });
        res.send({ success: true, data: { approvedClasses, pendingClasses, instructors } });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get('/api/enrolled-classes/:email', verifyJWT, async (req, res) => {
      try {
        const pipeline = [
          { $match: { userEmail: req.params.email } },
          { $lookup: { from: "classes", localField: "classesId", foreignField: "_id", as: "classes" } },
          { $unwind: "$classes" }
        ];
        const result = await enrolledCollection.aggregate(pipeline).toArray();
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Debug Routes
    app.get('/api/debug/user/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        res.send({ success: true, data: user });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Health check
    app.get('/health', (req, res) => {
      res.status(200).json({ success: true, status: 'OK' });
    });

    // Root endpoint
    app.get('/', (req, res) => {
      res.send('🚀 Frasa ID LMS Server is Running');
    });

    // Start server
    app.listen(port, () => {
      console.log(`✅ Server running on port ${port}`);
    });

  } catch (error) {
    console.error("❌ Failed to connect to MongoDB", error);
  }
}

run().catch(console.dir);