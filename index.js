// server.js - FINAL COMPLETE FIXED VERSION
const express = require('express');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.PAYMENT_SECRET);
const jwt = require("jsonwebtoken");
const cors = require('cors');

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@frasa-id-lms.wgss7.mongodb.net/?retryWrites=true&w=majority&appName=frasa-id-lms`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// JWT Middleware - IMPROVED WITH BETTER LOGGING
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  console.log('🔐 JWT Verification - Headers:', req.headers);
  console.log('🔐 Authorization header:', authorization);
  
  if (!authorization) {
    console.log('❌ No authorization header provided');
    return res.status(401).send({ 
      success: false,
      message: 'No authorization token provided' 
    });
  }
  
  const token = authorization.split(' ')[1];
  console.log('🔐 Token extracted:', token ? `${token.substring(0, 20)}...` : 'No token');
  
  if (!token) {
    console.log('❌ No token found in authorization header');
    return res.status(401).send({ 
      success: false,
      message: 'Invalid authorization format' 
    });
  }

  jwt.verify(token, process.env.ASSESS_SECRET, (err, decoded) => {
    if (err) {
      console.log('❌ JWT Verification failed:', err.message);
      return res.status(403).send({ 
        success: false,
        message: 'Forbidden access - Invalid token' 
      });
    }
    
    console.log('✅ JWT Verified for email:', decoded.email);
    req.decoded = decoded;
    next();
  });
};

// Role Middleware
const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decoded.email;
    const user = await usersCollection.findOne({ email });
    
    console.log('🔐 Admin verification for:', email);
    console.log('🔐 User role:', user?.role);
    
    if (user?.role === 'admin') {
      next();
    } else {
      console.log('❌ Admin access denied for:', email);
      return res.status(401).send({ 
        success: false,
        message: 'Unauthorized admin access' 
      });
    }
  } catch (error) {
    console.error("Admin verification error:", error);
    return res.status(500).send({ 
      success: false,
      message: 'Server error during admin verification' 
    });
  }
};

const verifyInstructor = async (req, res, next) => {
  try {
    const email = req.decoded.email;
    const user = await usersCollection.findOne({ email });
    
    console.log('🔐 Instructor verification for:', email);
    console.log('🔐 User role:', user?.role);
    
    if (user?.role === 'instructor' || user?.role === 'admin') {
      next();
    } else {
      console.log('❌ Instructor access denied for:', email);
      return res.status(403).send({ 
        success: false,
        message: 'Hanya instructor yang dapat mengakses fitur ini' 
      });
    }
  } catch (error) {
    console.error("Instructor verification error:", error);
    return res.status(500).send({ 
      success: false,
      message: 'Server error during instructor verification' 
    });
  }
};

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB!");

    // Database Collections
    const database = client.db("frasa-id-lms");
    const usersCollection = database.collection("users");
    const classesCollection = database.collection("classes");
    const cartCollection = database.collection("cart");
    const paymentCollection = database.collection("payment");
    const enrolledCollection = database.collection("enrolled");
    const appliedCollection = database.collection("applied");
    const feedbackCollection = database.collection("feedback");

    // ===== USER ROUTES =====
    app.post('/api/set-token', async (req, res) => {
      try {
        console.log('🔐 Setting token for:', req.body.email);
        const token = jwt.sign(req.body, process.env.ASSESS_SECRET || "rahasia", { expiresIn: '24h' });
        res.send({ 
          success: true,
          token 
        });
      } catch (error) {
        console.error('❌ Token creation error:', error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

    app.post('/api/new-user', async (req, res) => {
      try {
        const result = await usersCollection.insertOne(req.body);
        res.send({ 
          success: true,
          data: result 
        });
      } catch (error) {
        console.error('❌ New user error:', error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

    app.get('/api/users', async (req, res) => {
      try {
        const result = await usersCollection.find({}).toArray();
        res.send({ 
          success: true,
          data: result 
        });
      } catch (error) {
        console.error('❌ Get users error:', error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

   app.get('/api/user/:email', async (req, res) => {
    try {
      const email = req.params.email;
      console.log('🔍 Fetching user data for:', email);
      
      if (!email) {
        return res.status(400).send({ 
          success: false, 
          message: "Email parameter required" 
        });
      }

      const user = await usersCollection.findOne({ email });
      
      if (!user) {
        console.log('⚠️ User not found in database:', email);
        return res.status(404).send({ 
          success: false, 
          message: "User tidak ditemukan di database" 
        });
      }

      console.log('✅ User found:', {
        email: user.email,
        name: user.name,
        role: user.role || 'user'
      });

      // Pastikan selalu mengembalikan role
      const userData = {
        _id: user._id,
        name: user.name || '',
        email: user.email,
        role: user.role || 'user', // Default ke 'user' jika tidak ada
        photoUrl: user.photoUrl || '',
        address: user.address || '',
        about: user.about || '',
        skills: user.skills || '',
        phone: user.phone || '',
        createdAt: user.createdAt || new Date()
      };

      res.send({
        success: true,
        data: userData
      });
      
    } catch (error) {
      console.error("❌ Error fetching user:", error);
      res.status(500).send({ 
        success: false,
        message: "Server error",
        error: error.message 
      });
    }
  });
// POST /api/set-token - PERBAIKI ENDPOINT INI
app.post('/api/set-token', async (req, res) => {
  try {
    const { email, name, role } = req.body;
    
    console.log('🔐 Setting token for:', email, 'with role:', role);

    // Ambil role dari database jika tidak disediakan
    let userRole = role;
    if (!userRole) {
      const user = await usersCollection.findOne({ email });
      userRole = user?.role || 'user';
    }

    const tokenData = {
      email,
      name,
      role: userRole,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(
      tokenData, 
      process.env.ASSESS_SECRET || "rahasia", 
      { expiresIn: '24h' }
    );

    console.log('✅ Token created for role:', userRole);
    
    res.send({ 
      success: true,
      token,
      user: {
        email,
        name,
        role: userRole
      }
    });
  } catch (error) {
    console.error('❌ Token creation error:', error);
    res.status(500).send({ 
      success: false,
      error: error.message 
    });
  }
});

    // ===== INSTRUCTOR CLASS ROUTES - FINAL FIXED VERSION =====

    // ✅ ENDPOINT 1: GET ALL INSTRUCTOR CLASSES (WITH AUTH)
    app.get('/api/instructor/my-classes', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        
        console.log('🔍 Instructor MyClasses - Fetching for:', email);
        console.log('🔍 Decoded email from token:', req.decoded.email);
        
        if (!email) {
          return res.status(400).send({ 
            success: false, 
            message: 'Email parameter required' 
          });
        }

        // Verifikasi akses - email dari token harus sama dengan email dari query
        if (req.decoded.email !== email) {
          console.log('❌ Email mismatch:', req.decoded.email, 'vs', email);
          return res.status(403).send({ 
            success: false, 
            message: 'Unauthorized access - Email mismatch' 
          });
        }

        const classes = await classesCollection.find({ 
          instructorEmail: email 
        }).toArray();

        console.log('✅ Instructor MyClasses - Found:', classes.length, 'classes');
        
        res.send({ 
          success: true, 
          data: {
            classes: classes,
            total: classes.length,
            instructor: email
          }
        });
        
      } catch (error) {
        console.error("❌ Error fetching instructor classes:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ✅ ENDPOINT 2: GET APPROVED CLASSES BY INSTRUCTOR
    app.get('/api/instructor/approved-classes', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        
        console.log('🔍 Instructor ApprovedClasses - Fetching for:', email);
        
        if (!email) {
          return res.status(400).send({ 
            success: false, 
            message: 'Email parameter required' 
          });
        }

        if (req.decoded.email !== email) {
          return res.status(403).send({ 
            success: false, 
            message: 'Unauthorized access' 
          });
        }

        const classes = await classesCollection.find({ 
          instructorEmail: email,
          status: 'approved'
        }).toArray();

        console.log('✅ Instructor ApprovedClasses - Found:', classes.length);
        
        res.send({ 
          success: true, 
          data: {
            classes: classes,
            total: classes.length 
          }
        });
        
      } catch (error) {
        console.error("❌ Error fetching approved classes:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ✅ ENDPOINT 3: GET PENDING CLASSES BY INSTRUCTOR
    app.get('/api/instructor/pending-classes', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        
        console.log('🔍 Instructor PendingClasses - Fetching for:', email);
        
        if (!email) {
          return res.status(400).send({ 
            success: false, 
            message: 'Email parameter required' 
          });
        }

        if (req.decoded.email !== email) {
          return res.status(403).send({ 
            success: false, 
            message: 'Unauthorized access' 
          });
        }

        const classes = await classesCollection.find({ 
          instructorEmail: email,
          status: 'pending'
        }).toArray();

        console.log('✅ Instructor PendingClasses - Found:', classes.length);
        
        res.send({ 
          success: true, 
          data: {
            classes: classes,
            total: classes.length 
          }
        });
        
      } catch (error) {
        console.error("❌ Error fetching pending classes:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ✅ ENDPOINT 4: GET REJECTED CLASSES BY INSTRUCTOR
    app.get('/api/instructor/rejected-classes', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        
        console.log('🔍 Instructor RejectedClasses - Fetching for:', email);
        
        if (!email) {
          return res.status(400).send({ 
            success: false, 
            message: 'Email parameter required' 
          });
        }

        if (req.decoded.email !== email) {
          return res.status(403).send({ 
            success: false, 
            message: 'Unauthorized access' 
          });
        }

        const classes = await classesCollection.find({ 
          instructorEmail: email,
          status: 'rejected'
        }).toArray();

        console.log('✅ Instructor RejectedClasses - Found:', classes.length);
        
        res.send({ 
          success: true, 
          data: {
            classes: classes,
            total: classes.length 
          }
        });
        
      } catch (error) {
        console.error("❌ Error fetching rejected classes:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ✅ ENDPOINT 5: COMPATIBILITY ENDPOINT (OLD) - WITH AUTH
    app.get('/api/classes/:email', verifyJWT, async (req, res) => {
      try {
        const email = req.params.email;
        
        console.log('🔍 OLD Endpoint - Fetching classes for:', email);
        console.log('🔍 Decoded email:', req.decoded.email);
        
        if (req.decoded.email !== email) {
          return res.status(403).send({ 
            success: false, 
            message: 'Unauthorized access' 
          });
        }

        const classes = await classesCollection.find({ 
          instructorEmail: email 
        }).toArray();

        console.log('✅ OLD Endpoint - Found classes:', classes.length);
        
        res.send({ 
          success: true,
          data: classes 
        });
        
      } catch (error) {
        console.error("❌ Error fetching classes:", error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

    // ✅ ENDPOINT 6: TESTING ENDPOINT (NO AUTH) - FOR DEBUGGING
    app.get('/api/test/instructor-classes/:email', async (req, res) => {
      try {
        const email = req.params.email;
        
        console.log('🔍 TEST Endpoint - Fetching classes for:', email);
        
        if (!email) {
          return res.status(400).send({ 
            success: false, 
            message: 'Email parameter required' 
          });
        }

        const classes = await classesCollection.find({ 
          instructorEmail: email 
        }).toArray();

        console.log('✅ TEST Found classes:', classes.length);
        
        res.send({ 
          success: true, 
          data: {
            classes: classes,
            total: classes.length,
            debug: {
              email: email,
              collection: "classes",
              query: { instructorEmail: email },
              noAuth: true
            }
          }
        });
        
      } catch (error) {
        console.error("❌ TEST Error:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ✅ ENDPOINT 7: TEST AUTH ENDPOINT
    app.get('/api/test-auth', verifyJWT, async (req, res) => {
      try {
        res.send({
          success: true,
          message: 'Authentication successful',
          user: req.decoded
        });
      } catch (error) {
        console.error("❌ Test auth error:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ENDPOINT CLASS LAINNYA
    app.post('/api/new-class', verifyJWT, verifyInstructor, async (req, res) => {
      try {
        const classData = {
          name: req.body.name,
          image: req.body.image,
          instructorName: req.body.instructorName,
          instructorEmail: req.body.instructorEmail,
          availableSeats: parseInt(req.body.availableSeats),
          price: parseFloat(req.body.price),
          description: req.body.description,
          category: req.body.category,
          prerequisites: req.body.prerequisites,
          objectives: req.body.objectives,
          targetAudience: req.body.targetAudience,
          modules: req.body.modules,
          totalDuration: req.body.totalDuration,
          totalLessons: req.body.totalLessons,
          level: req.body.level,
          status: 'pending',
          submitted: new Date(),
          totalEnrolled: 0
        };

        const result = await classesCollection.insertOne(classData);
        res.send({ 
          success: true, 
          data: result,
          message: 'Class created successfully'
        });
      } catch (error) {
        console.error("Error adding class:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    app.get('/api/classes', async (req, res) => {
      try {
        const result = await classesCollection.find({ status: 'approved' }).toArray();
        res.send({ 
          success: true,
          data: result 
        });
      } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

    app.get('/api/classes-manage', async (req, res) => {
      try {
        const result = await classesCollection.find().toArray();
        res.send({ 
          success: true,
          data: result 
        });
      } catch (error) {
        console.error("Error fetching all classes:", error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

    app.get('/api/class/:id', async (req, res) => {
      try {
        const result = await classesCollection.findOne({ 
          _id: new ObjectId(req.params.id) 
        });
        
        if (!result) {
          return res.status(404).send({ 
            success: false,
            error: 'Class not found' 
          });
        }
        
        res.send({ 
          success: true,
          data: result 
        });
      } catch (error) {
        console.error("Error fetching class:", error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

    app.patch('/api/change-status/:id', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ 
            success: false,
            error: 'ID tidak valid' 
          });
        }

        const { status, reason } = req.body;
        if (!['approved', 'rejected', 'pending'].includes(status)) {
          return res.status(400).json({ 
            success: false,
            error: 'Status tidak valid' 
          });
        }

        const updateDoc = { $set: { status } };
        if (reason) updateDoc.$set.reason = reason;

        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc,
          { upsert: true }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ 
            success: false,
            error: 'Kelas tidak ditemukan' 
          });
        }

        res.json({ 
          success: true, 
          data: result,
          message: `Class status updated to ${status}`
        });
      } catch (err) {
        console.error('Error updating status:', err);
        res.status(500).json({ 
          success: false,
          error: 'Server error' 
        });
      }
    });

    app.put('/api/update-class/:id', verifyJWT, verifyInstructor, async (req, res) => {
      try {
        const updateDoc = {
          $set: {
            name: req.body.name,
            description: req.body.description,
            price: req.body.price,
            availableSeats: parseInt(req.body.availableSeats),
            category: req.body.category,
            prerequisites: req.body.prerequisites,
            objectives: req.body.objectives,
            targetAudience: req.body.targetAudience,
            modules: req.body.modules,
            totalDuration: req.body.totalDuration,
            totalLessons: req.body.totalLessons,
            level: req.body.level,
            status: 'pending',
          }
        };
        
        const result = await classesCollection.updateOne(
          { _id: new ObjectId(req.params.id) }, 
          updateDoc
        );
        
        res.send({ 
          success: true, 
          data: result,
          message: 'Class updated successfully'
        });
      } catch (error) {
        console.error("Error updating class:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ===== CART ROUTES =====
    app.post('/api/add-to-cart', verifyJWT, async (req, res) => {
      try {
        const { classId, userMail } = req.body;
        
        const existingItem = await cartCollection.findOne({ 
          classId: classId, 
          userMail: userMail 
        });
        
        if (existingItem) {
          return res.status(400).send({ 
            success: false, 
            message: 'Kelas sudah ada di keranjang' 
          });
        }
        
        const result = await cartCollection.insertOne({
          classId,
          userMail,
          submitted: new Date()
        });
        
        res.send({ 
          success: true, 
          data: {
            insertedId: result.insertedId 
          },
          message: 'Class added to cart successfully'
        });
      } catch (error) {
        console.error("Error adding to cart:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    app.get('/api/cart/:email', verifyJWT, async (req, res) => {
      try {
        const carts = await cartCollection.find({ 
          userMail: req.params.email 
        }).toArray();
        
        const classIds = carts.map(cart => new ObjectId(cart.classId));
        const result = await classesCollection.find({ 
          _id: { $in: classIds } 
        }).toArray();
        
        res.send({ 
          success: true,
          data: result 
        });
      } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

    // ===== PAYMENT ROUTES =====
    app.post('/api/create-payment-intent', async (req, res) => {
      try {
        const { price } = req.body;
        const amount = parseInt(price * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          success: true,
          data: {
            clientSecret: paymentIntent.client_secret
          }
        });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

    // ===== STATS ROUTES =====
    app.get('/api/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const approvedClasses = await classesCollection.countDocuments({ status: 'approved' });
        const pendingClasses = await classesCollection.countDocuments({ status: 'pending' });
        const instructors = await usersCollection.countDocuments({ role: 'instructor' });
        const totalClasses = await classesCollection.countDocuments();
        const totalEnrolled = await enrolledCollection.countDocuments();
        
        res.send({ 
          success: true,
          data: {
            approvedClasses, 
            pendingClasses, 
            instructors, 
            totalClasses, 
            totalEnrolled 
          }
        });
      } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

    app.get('/api/instructors', async (req, res) => {
      try {
        const result = await usersCollection.find({ role: 'instructor' }).toArray();
        res.send({ 
          success: true,
          data: result 
        });
      } catch (error) {
        console.error("Error fetching instructors:", error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

    app.get('/api/enrolled-classes/:email', verifyJWT, async (req, res) => {
      try {
        const pipeline = [
          { $match: { userEmail: req.params.email } },
          { 
            $lookup: { 
              from: "classes", 
              localField: "classesId", 
              foreignField: "_id", 
              as: "classes" 
            }
          },
          { $unwind: "$classes" },
          { 
            $project: { 
              _id: 0,
              classId: "$classes._id",
              classes: 1
            }
          }
        ];
        
        const result = await enrolledCollection.aggregate(pipeline).toArray();
        res.send({ 
          success: true,
          data: result 
        });
      } catch (error) {
        console.error("Error fetching enrolled classes:", error);
        res.status(500).send({ 
          success: false,
          error: error.message 
        });
      }
    });

    // ===== DEBUG ROUTES =====
    app.get('/api/debug/user/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        
        if (!user) {
          return res.status(404).send({ 
            success: false, 
            message: "User tidak ditemukan"
          });
        }
        
        res.send({
          success: true,
          data: user,
          debug: {
            hasRole: !!user.role,
            roleValue: user.role,
            isRoleValid: ['admin', 'instructor', 'user'].includes(user.role),
            collections: {
              users: await usersCollection.countDocuments(),
              classes: await classesCollection.countDocuments({ instructorEmail: user.email })
            }
          }
        });
      } catch (error) {
        console.error('❌ DEBUG Error:', error);
        res.status(500).send({ 
          success: false, 
          error: error.message
        });
      }
    });

    app.get('/api/debug/classes-data', async (req, res) => {
      try {
        const email = req.query.email;
        
        const user = await usersCollection.findOne({ email });
        const classes = await classesCollection.find({ instructorEmail: email }).toArray();
        
        res.send({
          success: true,
          data: {
            user: {
              exists: !!user,
              email: user?.email,
              role: user?.role,
              name: user?.name
            },
            classes: {
              count: classes.length,
              data: classes
            }
          }
        });
        
      } catch (error) {
        console.error('Debug error:', error);
        res.status(500).send({
          success: false,
          error: error.message
        });
      }
    });

    // Health check endpoint
    app.get('/health', async (req, res) => {
      try {
        await client.db("admin").command({ ping: 1 });
        res.status(200).json({ 
          success: true,
          status: 'OK', 
          database: 'Connected',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ 
          success: false,
          status: 'Error', 
          database: 'Disconnected',
          error: error.message
        });
      }
    });

    // Root endpoint
    app.get('/', (req, res) => {
      res.send('🚀 Frasa ID LMS Server is Running - FINAL FIXED VERSION');
    });

    // Start server
    app.listen(port, () => {
      console.log(`✅ Server running on port ${port}`);
      console.log(`✅ FIXED INSTRUCTOR ENDPOINTS AVAILABLE:`);
      console.log(`   GET /api/instructor/my-classes?email=user@example.com`);
      console.log(`   GET /api/instructor/approved-classes?email=user@example.com`);
      console.log(`   GET /api/instructor/pending-classes?email=user@example.com`);
      console.log(`   GET /api/instructor/rejected-classes?email=user@example.com`);
      console.log(`   GET /api/test/instructor-classes/user@example.com (NO AUTH)`);
      console.log(`   GET /api/test-auth (TEST AUTH)`);
    });

  } catch (error) {
    console.error("❌ Failed to connect to MongoDB", error);
  }
}


run().catch(console.dir);