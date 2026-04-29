const express = require("express")
const dotenv= require("dotenv").config({quiet:true})
const cors = require("cors")
const errorHandler = require("./middleware/errorHandler");
const { startWorker, shutdownWorker } = require("./services/imageValidationService");


const app = express();

const port = process.env.PORT || 5003;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));


app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/complaints", require("./routes/complaintRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/departments", require("./routes/departmentRoutes"));
// app.use("/api/upload", require('./routes/uploadRoutes'));
// app.use("/api/user", require("./routes/userRoutes"));

app.use(errorHandler);

const server = app.listen(port, async () => {
    console.log("[Server] Listening on port", port);
    
    // Initialize image validation worker on startup
    console.log("[Server] Initializing image validation worker...");
    try {
        await startWorker();
        console.log("[Server] Image validation worker initialized successfully");
    } catch (err) {
        console.error("[Server] Failed to initialize image validation worker:", err);
        // Worker initialization failure is not fatal; system will degrade gracefully
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Server] SIGTERM received, shutting down gracefully...');
    
    await shutdownWorker().catch(err => {
        console.error('[Server] Error during worker shutdown:', err);
    });
    
    server.close(() => {
        console.log('[Server] Server shut down');
        process.exit(0);
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('[Server] Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
});

process.on('SIGINT', async () => {
    console.log('[Server] SIGINT received, shutting down gracefully...');
    
    await shutdownWorker().catch(err => {
        console.error('[Server] Error during worker shutdown:', err);
    });
    
    server.close(() => {
        console.log('[Server] Server shut down');
        process.exit(0);
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('[Server] Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
});