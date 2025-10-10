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

// Middleware
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: 'Invalid authorization' });
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ASSESS_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    req.decoded = decoded;
    next();
  });
};

// ===== PERBAIKI MIDDLEWARE =====
const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decoded.email;
    const user = await usersCollection.findOne({ email });
    if (user?.role === 'admin') {
      next();
    } else {
      return res.status(401).send({ message: 'Unauthorized access' });
    }
  } catch (error) {
    console.error("Admin verification error:", error);
    return res.status(500).send({ message: 'Server error' });
  }
};

const verifyInstructor = async (req, res, next) => {
  try {
    const email = req.decoded.email;
    const user = await usersCollection.findOne({ email });
    
    if (user?.role === 'instructor' || user?.role === 'admin') {
      next();
    } else {
      return res.status(403).send({ 
        message: 'Hanya instructor yang dapat mengakses fitur ini' 
      });
    }
  } catch (error) {
    console.error("Instructor verification error:", error);
    return res.status(500).send({ message: 'Server error' });
  }
};

const verifyInstructorOrOwnData = async (req, res, next) => {
  try {
    const email = req.decoded.email;
    const requestedEmail = req.params.email || req.query.email;
    
    const user = await usersCollection.findOne({ email });
    
    // Allow jika: admin, instructor, atau akses data sendiri
    if (user?.role === 'admin' || 
        user?.role === 'instructor' || 
        email === requestedEmail) {
      next();
    } else {
      return res.status(403).send({ 
        message: 'Unauthorized access' 
      });
    }
  } catch (error) {
    console.error("Middleware error:", error);
    return res.status(500).send({ message: 'Server error' });
  }
};

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

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
      const token = jwt.sign(req.body, process.env.ASSESS_SECRET || "rahasia", { expiresIn: '24h' });
      res.send({ token });
    });

    app.post('/api/new-user', async (req, res) => {
      const result = await usersCollection.insertOne(req.body);
      res.send(result);
    });

    app.get('/api/users', async (req, res) => {
      const result = await usersCollection.find({}).toArray();
      res.send(result);
    });

    app.get('/api/users/:id', async (req, res) => {
      const result = await usersCollection.findOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    // ✅ PERBAIKI: ENDPOINT GET USER BY EMAIL
    app.get('/api/user/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        console.log('🔍 User data for:', req.params.email, user);
        
        if (!user) {
          return res.status(404).send({ 
            success: false, 
            message: "User tidak ditemukan" 
          });
        }
        
        res.send({
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role || 'user', // ✅ DEFAULT VALUE JIKA ROLE NULL
          photoUrl: user.photoUrl,
          address: user.address,
          about: user.about,
          skills: user.skills,
          createdAt: user.createdAt
        });
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).send({ error: error.message });
      }
    });

    app.delete('/api/delete-user/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    app.put('/api/update-user/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const updateDoc = {
        $set: {
          name: req.body.name,
          email: req.body.email,
          role: req.body.role,
          address: req.body.address,
          about: req.body.about,
          photoUrl: req.body.photoUrl,
          skills: req.body.skills || null,
        }
      };
      const result = await usersCollection.updateOne({ _id: new ObjectId(req.params.id) }, updateDoc, { upsert: true });
      res.send(result);
    });

    // ===== CLASS ROUTES - YANG DIPERBAIKI =====

    // ✅ ENDPOINT BARU: GET CLASSES BY INSTRUCTOR (REKOMENDASI)
    app.get('/api/instructor/classes', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        
        console.log('🔍 Fetching classes for instructor:', email);
        
        if (!email) {
          return res.status(400).send({ 
            success: false, 
            message: 'Email parameter required' 
          });
        }

        // Verifikasi bahwa user hanya bisa akses data sendiri
        if (req.decoded.email !== email) {
          return res.status(403).send({ 
            success: false, 
            message: 'Unauthorized access' 
          });
        }

        const classes = await classesCollection.find({ 
          instructorEmail: email 
        }).toArray();

        console.log('✅ Found classes:', classes.length);
        
        res.send({ 
          success: true, 
          classes: classes,
          total: classes.length
        });
        
      } catch (error) {
        console.error("❌ Error fetching instructor classes:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ✅ ENDPOINT LAMA: GET CLASSES BY EMAIL (COMPATIBLE)
    app.get('/api/classes/:email', verifyJWT, async (req, res) => {
      try {
        const email = req.params.email;
        
        console.log('🔍 Fetching classes for:', email);
        
        // Verifikasi bahwa user hanya bisa akses data sendiri
        if (req.decoded.email !== email) {
          return res.status(403).send({ 
            success: false, 
            message: 'Unauthorized access' 
          });
        }

        const classes = await classesCollection.find({ 
          instructorEmail: email 
        }).toArray();

        console.log('✅ Found classes:', classes.length);
        
        res.send(classes); // ✅ KIRIM LANGSUNG ARRAY (COMPATIBLE DENGAN FRONTEND LAMA)
        
      } catch (error) {
        console.error("❌ Error fetching classes:", error);
        res.status(500).send({ error: error.message });
      }
    });

    // ✅ ENDPOINT UNTUK GET PENDING CLASSES
    app.get('/api/instructor/pending-classes', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        
        if (!email) {
          return res.status(400).send({ 
            success: false, 
            message: 'Email parameter required' 
          });
        }

        // Verifikasi akses
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

        res.send({ 
          success: true, 
          classes: classes,
          total: classes.length 
        });
        
      } catch (error) {
        console.error("Error fetching pending classes:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ✅ ENDPOINT UNTUK GET APPROVED CLASSES
    app.get('/api/instructor/approved-classes', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        
        if (!email) {
          return res.status(400).send({ 
            success: false, 
            message: 'Email parameter required' 
          });
        }

        // Verifikasi akses
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

        res.send({ 
          success: true, 
          classes: classes,
          total: classes.length 
        });
        
      } catch (error) {
        console.error("Error fetching approved classes:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ENDPOINT LAINNYA UNTUK CLASSES (TETAP SAMA)
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
        res.send({ success: true, data: result });
      } catch (error) {
        console.error("Error adding class:", error);
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get('/api/classes', async (req, res) => {
      const result = await classesCollection.find({ status: 'approved' }).toArray();
      res.send(result);
    });

    app.get('/api/classes-manage', async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    app.get('/api/class/:id', async (req, res) => {
      try {
        const result = await classesCollection.findOne({ 
          _id: new ObjectId(req.params.id) 
        });
        
        if (!result) {
          return res.status(404).send({ error: 'Class not found' });
        }
        
        res.send(result);
      } catch (error) {
        console.error("Error fetching class:", error);
        res.status(500).send({ error: error.message });
      }
    });

    app.get('/api/class-with-modules/:id', async (req, res) => {
      try {
        const result = await classesCollection.findOne({ 
          _id: new ObjectId(req.params.id) 
        });
        
        if (!result) {
          return res.status(404).send({ error: 'Class not found' });
        }
        
        res.send(result);
      } catch (error) {
        console.error("Error fetching class:", error);
        res.status(500).send({ error: error.message });
      }
    });

    app.patch('/api/change-status/:id', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: 'ID tidak valid' });
        }

        const { status, reason } = req.body;
        if (!['approved', 'rejected', 'pending'].includes(status)) {
          return res.status(400).json({ error: 'Status tidak valid' });
        }

        const updateDoc = { $set: { status } };
        if (reason) updateDoc.$set.reason = reason;

        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc,
          { upsert: true }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: 'Kelas tidak ditemukan' });
        }

        res.json({ success: true, result });
      } catch (err) {
        console.error('Error updating status:', err);
        res.status(500).json({ error: 'Server error' });
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
            status: 'pending', // Reset status to pending when updated
          }
        };
        
        const result = await classesCollection.updateOne(
          { _id: new ObjectId(req.params.id) }, 
          updateDoc
        );
        
        res.send({ success: true, result });
      } catch (error) {
        console.error("Error updating class:", error);
        res.status(500).send({ success: false, error: error.message });
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
          insertedId: result.insertedId 
        });
      } catch (error) {
        console.error("Error adding to cart:", error);
        res.status(500).send({ 
          success: false, 
          error: error.message 
        });
      }
    });

    app.get('/api/cart-item/:id', verifyJWT, async (req, res) => {
      try {
        const result = await cartCollection.findOne({ 
          classId: req.params.id, 
          userMail: req.query.email 
        }, { projection: { classId: 1 } });
        
        res.send(result);
      } catch (error) {
        console.error("Error fetching cart item:", error);
        res.status(500).send({ error: error.message });
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
        
        res.send(result);
      } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).send({ error: error.message });
      }
    });

    app.delete('/api/delete-cart-item/:id', verifyJWT, async (req, res) => {
      try {
        const result = await cartCollection.deleteOne({ 
          classId: req.params.id 
        });
        
        res.send({ 
          success: true, 
          deletedCount: result.deletedCount 
        });
      } catch (error) {
        console.error("Error deleting cart item:", error);
        res.status(500).send({ error: error.message });
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
          clientSecret: paymentIntent.client_secret
        });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ error: error.message });
      }
    });

    app.post('/api/payment-info', verifyJWT, async (req, res) => {
      try {
        const { classesId, userEmail, transactionId, amount } = req.body;
        const singleClassId = req.query.classId;

        const classesToProcess = singleClassId 
          ? [new ObjectId(singleClassId)] 
          : classesId.map(id => new ObjectId(id));

        const updateOperations = classesToProcess.map(classId => {
          return classesCollection.updateOne(
            { _id: classId },
            { 
              $inc: { 
                totalEnrolled: 1,
                availableSeats: -1
              } 
            }
          );
        });

        await Promise.all(updateOperations);

        const paymentResult = await paymentCollection.insertOne(req.body);

        const deleteQuery = singleClassId
          ? { classId: singleClassId, userMail: userEmail }
          : { classId: { $in: classesId }, userMail: userEmail };

        await cartCollection.deleteMany(deleteQuery);

        const enrolledData = {
          userEmail,
          classesId: classesToProcess,
          transactionId,
          enrolledDate: new Date(),
          status: 'active'
        };

        await enrolledCollection.insertOne(enrolledData);

        res.send({ 
          success: true,
          message: 'Payment processed successfully'
        });

      } catch (error) {
        console.error("Error processing payment:", error);
        res.status(500).send({ error: error.message });
      }
    });

    app.get('/api/payment-history/:email', async (req, res) => {
      const result = await paymentCollection.find({ userEmail: req.params.email }).sort({ date: -1 }).toArray();
      res.send(result);
    });

    app.get('/api/payment-history-length/:email', async (req, res) => {
      const total = await paymentCollection.countDocuments({ userEmail: req.params.email });
      res.send({ total });
    });

    // ===== STATS & ANALYTICS ROUTES =====
    app.get('/api/popular_classes', async (req, res) => {
      const result = await classesCollection.find()
        .sort({ totalEnrolled: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get('/api/popular-instructors', async (req, res) => {
      const pipeline = [
        { 
          $group: { 
            _id: "$instructorEmail", 
            totalEnrolled: { $sum: "$totalEnrolled" } 
          }
        },
        { 
          $lookup: { 
            from: "users", 
            localField: "_id", 
            foreignField: "email", 
            as: "instructor" 
          }
        },
        { 
          $match: { 
            "instructor.role": "instructor" 
          }
        },
        { 
          $project: { 
            _id: 0, 
            instructor: { $arrayElemAt: ["$instructor", 0] }, 
            totalEnrolled: 1 
          }
        },
        { 
          $sort: { 
            totalEnrolled: -1 
          }
        },
        { 
          $limit: 6 
        }
      ];
      
      const result = await classesCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    app.get('/api/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
      const approvedClasses = await classesCollection.countDocuments({ status: 'approved' });
      const pendingClasses = await classesCollection.countDocuments({ status: 'pending' });
      const instructors = await usersCollection.countDocuments({ role: 'instructor' });
      const totalClasses = await classesCollection.countDocuments();
      const totalEnrolled = await enrolledCollection.countDocuments();
      
      res.send({ approvedClasses, pendingClasses, instructors, totalClasses, totalEnrolled });
    });

    app.get('/api/instructors', async (req, res) => {
      const result = await usersCollection.find({ role: 'instructor' }).toArray();
      res.send(result);
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
        res.send(result);
      } catch (error) {
        console.error("Error fetching enrolled classes:", error);
        res.status(500).send({ error: error.message });
      }
    });

    // ===== APPLIED INSTRUCTOR ROUTES =====
    app.post('/api/as-instructor', async (req, res) => {
      const result = await appliedCollection.insertOne(req.body);
      res.send(result);
    });

    app.get('/api/applied-instructors/:email', async (req, res) => {
      const result = await appliedCollection.findOne({ email: req.params.email });
      res.send(result);
    });

    // ===== DEBUG & EMERGENCY ROUTES =====
    app.get('/api/debug/user/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        console.log('🔍 DEBUG User Data:', user);
        
        if (!user) {
          return res.status(404).send({ 
            success: false, 
            message: "User tidak ditemukan",
            debug: { 
              email: req.params.email,
              collection: "users",
              totalUsers: await usersCollection.countDocuments()
            }
          });
        }
        
        res.send({
          success: true,
          data: user,
          debug: {
            hasRole: !!user.role,
            roleValue: user.role,
            allFields: Object.keys(user),
            isRoleValid: ['admin', 'instructor', 'user'].includes(user.role)
          }
        });
      } catch (error) {
        console.error('❌ DEBUG Error:', error);
        res.status(500).send({ 
          success: false, 
          error: error.message,
          stack: error.stack
        });
      }
    });

    app.get('/api/debug/classes-data', async (req, res) => {
      try {
        const email = req.query.email;
        
        const user = await usersCollection.findOne({ email });
        const classes = await classesCollection.find({ instructorEmail: email }).toArray();
        const totalClasses = await classesCollection.countDocuments();
        const totalUsers = await usersCollection.countDocuments();
        
        res.send({
          success: true,
          debug: {
            user: {
              exists: !!user,
              email: user?.email,
              role: user?.role,
              name: user?.name
            },
            classes: {
              count: classes.length,
              data: classes
            },
            database: {
              totalClasses,
              totalUsers,
              status: 'connected'
            }
          }
        });
        
      } catch (error) {
        console.error('Debug error:', error);
        res.status(500).send({
          success: false,
          error: error.message,
          stack: error.stack
        });
      }
    });

    // Emergency endpoint untuk update role user
    app.patch('/api/emergency/update-role/:email', async (req, res) => {
      try {
        const { role } = req.body;
        const validRoles = ['admin', 'instructor', 'user'];
        
        if (!validRoles.includes(role)) {
          return res.status(400).send({ 
            success: false, 
            message: 'Role harus: admin, instructor, atau user',
            validRoles 
          });
        }
        
        const existingUser = await usersCollection.findOne({ email: req.params.email });
        if (!existingUser) {
          return res.status(404).send({ 
            success: false, 
            message: 'User tidak ditemukan' 
          });
        }
        
        const result = await usersCollection.updateOne(
          { email: req.params.email },
          { $set: { role: role } }
        );
        
        const updatedUser = await usersCollection.findOne({ email: req.params.email });
        
        res.send({ 
          success: true, 
          message: `Role berhasil diupdate menjadi: ${role}`,
          previousRole: existingUser.role,
          newRole: updatedUser.role,
          result 
        });
      } catch (error) {
        console.error('Error updating role:', error);
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
        res.status(200).json({ status: 'OK', database: 'Connected' });
      } catch (error) {
        res.status(500).json({ status: 'Error', database: 'Disconnected' });
      }
    });

    // Root endpoint
    app.get('/', (req, res) => {
      res.send('Frasa ID LMS Server is Running - FIXED VERSION');
    });

    // 404 Handler
    app.use('*', (req, res) => {
      res.status(404).json({ 
        success: false,
        message: 'Route not found',
        path: req.originalUrl
      });
    });

    // ===== START SERVER =====
    app.listen(port, () => {
      console.log(`✅ Server running on port ${port}`);
      console.log(`✅ Fixed endpoints available:`);
      console.log(`   GET /api/instructor/classes?email=user@example.com`);
      console.log(`   GET /api/classes/:email`);
      console.log(`   GET /api/instructor/pending-classes?email=user@example.com`);
      console.log(`   GET /api/instructor/approved-classes?email=user@example.com`);
    });

  } catch (error) {
    console.error("Failed to connect to MongoDB", error);
  }
}

run().catch(console.dir);