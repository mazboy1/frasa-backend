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
        console.log('🔍 Fetching all classes for management...');
        const result = await classesCollection.find().toArray();
        console.log(`✅ Found ${result.length} classes`);
        
        res.send({ 
          success: true, 
          data: result,
          total: result.length 
        });
      } catch (error) {
        console.error('❌ Error fetching classes-manage:', error.message);
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

    // ✅ NEW ENDPOINT - Class with modules
    app.get('/api/class-with-modules/:id', async (req, res) => {
      try {
        const classId = req.params.id;
        
        if (!classId) {
          return res.status(400).send({ 
            success: false, 
            message: 'Class ID required' 
          });
        }

        console.log('🔍 Fetching class with modules:', classId);

        const classData = await classesCollection.findOne({ 
          _id: new ObjectId(classId) 
        });

        if (!classData) {
          console.warn('⚠️ Class not found:', classId);
          return res.status(404).send({ 
            success: false, 
            message: 'Class not found' 
          });
        }

        console.log('✅ Class found:', classData.name);

        res.send({ 
          success: true, 
          data: classData 
        });
      } catch (error) {
        console.error('❌ Error fetching class-with-modules:', error.message);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ✅ NEW ENDPOINT - Apply as Instructor (POST)
    app.post('/api/as-instructor', async (req, res) => {
      try {
        const { name, email, experience, submitted } = req.body;

        console.log('📝 [POST /api/as-instructor] New application:', email);

        // Validation
        if (!name || !email || !experience) {
          return res.status(400).send({
            success: false,
            message: 'Semua field harus diisi'
          });
        }

        if (experience.length < 10) {
          return res.status(400).send({
            success: false,
            message: 'Pengalaman minimal 10 karakter'
          });
        }

        // Check if already applied
        const existingApplication = await appliedCollection.findOne({ email });
        if (existingApplication) {
          return res.status(400).send({
            success: false,
            message: 'Anda sudah pernah mendaftar sebagai instruktur'
          });
        }

        // Insert application
        const applicationData = {
          name,
          email,
          experience,
          status: 'pending',
          submitted: submitted ? new Date(submitted) : new Date(),
          reviewed: null,
          reviewedBy: null
        };

        const result = await appliedCollection.insertOne(applicationData);

        console.log('✅ Application created:', result.insertedId);

        res.status(201).send({
          success: true,
          message: 'Aplikasi berhasil dikirim',
          data: {
            _id: result.insertedId,
            ...applicationData
          }
        });
      } catch (error) {
        console.error('❌ Error in as-instructor:', error.message);
        res.status(500).send({
          success: false,
          message: 'Server error',
          error: error.message
        });
      }
    });

    // ✅ NEW ENDPOINT - Check application status (GET)
    app.get('/api/applied-instructors/:email', async (req, res) => {
      try {
        const email = req.params.email;

        console.log('🔍 Checking application for:', email);

        const application = await appliedCollection.findOne({ email });

        if (!application) {
          return res.status(404).send({
            success: false,
            message: 'Belum ada aplikasi',
            data: null
          });
        }

        console.log('✅ Application found:', application._id);

        res.send({
          success: true,
          data: application
        });
      } catch (error) {
        console.error('❌ Error in applied-instructors:', error.message);
        res.status(500).send({
          success: false,
          error: error.message
        });
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

    // Admin User Management Routes
    app.get('/api/users', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        console.log('🔍 [GET /api/users] Admin requesting all users...');
        console.log('Decoded token email:', req.decoded?.email);
        
        const users = await usersCollection.find({}).toArray();
        
        console.log(`✅ Found ${users.length} users`);
        
        const sanitizedUsers = users.map(user => ({
          _id: user._id,
          name: user.name || '',
          email: user.email,
          role: user.role || 'user',
          photoUrl: user.photoUrl || '',
          phone: user.phone || '',
          createdAt: user.createdAt || new Date()
        }));
        
        console.log('📤 Sending response with data array:', sanitizedUsers.length);
        
        res.status(200).send({ 
          success: true,
          data: sanitizedUsers,
          total: sanitizedUsers.length
        });
      } catch (error) {
        console.error('❌ [GET /api/users] Error:', error.message);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    app.patch('/api/users/:id/role', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const { role } = req.body;
        const userId = req.params.id;
        
        console.log(`🔄 Updating user ${userId} role to ${role}`);
        
        if (!['user', 'instructor', 'admin'].includes(role)) {
          return res.status(400).send({ 
            success: false, 
            message: 'Invalid role' 
          });
        }
        
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { role } }
        );
        
        if (result.matchedCount === 0) {
          return res.status(404).send({ 
            success: false, 
            message: 'User not found' 
          });
        }
        
        console.log('✅ User role updated');
        
        res.send({ 
          success: true, 
          message: 'User role updated',
          data: result 
        });
      } catch (error) {
        console.error('❌ Error updating user role:', error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    app.delete('/api/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const userId = req.params.id;
        
        console.log(`🗑️ Deleting user ${userId}`);
        
        const result = await usersCollection.deleteOne(
          { _id: new ObjectId(userId) }
        );
        
        if (result.deletedCount === 0) {
          return res.status(404).send({ 
            success: false, 
            message: 'User not found' 
          });
        }
        
        console.log('✅ User deleted');
        
        res.send({ 
          success: true, 
          message: 'User deleted',
          data: result 
        });
      } catch (error) {
        console.error('❌ Error deleting user:', error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
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