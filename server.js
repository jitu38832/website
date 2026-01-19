const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const app = express();

// Get frontend URL from environment or use default
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://teachlypro.com';

// CORS configuration - Allow all origins for now (including teachlypro.com)
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all origins for now (can be restricted later)
    return callback(null, true);
    
    // Allow localhost for development
    // if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    //   return callback(null, true);
    // }
    
    // Allow production domains
    // if (origin.includes('teachlypro.com') || origin.includes('netlify.app') || origin.includes('vercel.app')) {
    //   return callback(null, true);
    // }
  },
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Razorpay Configuration
// TODO: Replace with your actual Razorpay credentials from Razorpay Dashboard
// Get these from: https://dashboard.razorpay.com/app/keys
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_RtwwIU8GvZEOnq';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '9F1zU9AJaDAIlxL1MFIb984E';

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
}); 

// Multiple email transporter configurations for fallback
const emailConfigs = [
  {
    name: 'Gmail Primary',
    config: {
      service: 'gmail',
      auth: {
        user: 'teachlypro720@gmail.com',
        pass: 'koep qfyv mnzz scgz'
      }
    }
  },
  {
    name: 'Gmail Secondary',
    config: {
      service: 'gmail',
      auth: {
        user: 'teachlypro720@gmail.com',
        pass: 'koep qfyv mnzz scgz'
      }
    }
  },
  {
    name: 'Outlook',
    config: {
      service: 'hotmail',
      auth: {
        user: 'monikamaths021@outlook.com', // You can create this account
        pass: 'YourOutlookPassword'
      }
    }
  }
];

// Create transporters
const transporters = emailConfigs.map(config => ({
  name: config.name,
  transporter: nodemailer.createTransport(config.config)
}));

// OTP storage
const otpStorage = new Map();

// Enhanced email sending with fallback
async function sendEmailWithFallback(mailOptions, retryCount = 0) {
  for (let i = 0; i < transporters.length; i++) {
    try {
      const { name, transporter } = transporters[i];
      console.log(`📧 Attempting to send email via ${name}...`);
      
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully via ${name}`);
      return { success: true, service: name };
    } catch (error) {
      console.log(`❌ Failed to send via ${name}: ${error.message}`);
      
      // If this is the last transporter and we've tried all, throw error
      if (i === transporters.length - 1) {
        throw error; 
      }
    }
  } 
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    emailServices: transporters.map(t => t.name),
    otpStorageSize: otpStorage.size,
    otpStorageKeys: Array.from(otpStorage.keys())
  });
});

// Debug endpoint to check stored OTPs (development only)
app.get('/api/debug/otps', (req, res) => {
  const otps = {};
  otpStorage.forEach((value, key) => {
    otps[key] = {
      otp: value.otp,
      timestamp: new Date(value.timestamp).toISOString(),
      age: ((Date.now() - value.timestamp) / (60 * 1000)).toFixed(2) + ' minutes',
      expired: (Date.now() - value.timestamp) > (10 * 60 * 1000)
    };
  });
  res.json({
    count: otpStorage.size,
    otps: otps
  });
});

// Send OTP endpoint with enhanced email delivery
app.post('/api/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Normalize email: lowercase and trim
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // If there's an existing OTP for this email, log it before overwriting
    const existingOtp = otpStorage.get(normalizedEmail);
    if (existingOtp) {
      console.log(`⚠️  Replacing existing OTP for ${normalizedEmail}`);
    }
    
    // Store OTP with timestamp using normalized email (overwrites any existing OTP)
    otpStorage.set(normalizedEmail, {
      otp: otp,
      timestamp: Date.now()
    });
    
    console.log(`📧 Stored NEW OTP for ${normalizedEmail}: ${otp} at ${new Date().toISOString()}`);
    console.log(`⏰ OTP will expire at ${new Date(Date.now() + 10 * 60 * 1000).toISOString()}`);

    // Email content
    const mailOptions = {
      from: 'teachlypro720@gmail.com',
      to: email,
      subject: "Your OTP for Teachly Pro",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333;">Email Verification</h2>
            <p>Hello!</p>
            <p>Your OTP for account verification is:</p>
            <div style="background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h1 style="font-size: 32px; letter-spacing: 8px; margin: 0;">${otp}</h1>
            </div>
            <p><strong>This OTP will expire in 10 minutes.</strong></p>
            <p>If you didn't request this OTP, please ignore this email.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong><br>
              Email: teachlypro720@gmail.com
            </p>
          </div>
        </div>
      `
    };

    // Try to send email with fallback (use original email for sending, normalized for storage)
    try {
      const mailOptionsWithOriginalEmail = {
        ...mailOptions,
        to: email // Use original email for sending
      };
      const result = await sendEmailWithFallback(mailOptionsWithOriginalEmail);
      console.log(`✅ OTP sent to ${email}: ${otp} via ${result.service}`);
      
      // Always return OTP so client can verify locally even if server restarts
      res.json({ 
        success: true, 
        message: 'OTP sent successfully', 
        otp: otp, // Always return OTP for client-side verification
        service: result.service
      });
    } catch (emailError) {
      console.log(`⚠️  All email services failed: ${emailError.message}`);
      console.log(`📧 OTP for ${normalizedEmail}: ${otp}`);
      console.log(`🔍 Please check your email manually or use the OTP above for testing`);
      
      // Still return success but with fallback OTP - always return OTP when email fails
      console.log(`📧 Email failed, but OTP is available: ${otp}`);
      res.json({ 
        success: true, 
        message: 'OTP generated (email service temporarily unavailable). Check console for OTP.', 
        otp: otp, // Always return OTP when email fails
        fallback: true
      });
    }
    
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP endpoint
app.post('/api/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    // Normalize email: lowercase and trim (must match how it was stored)
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.toString().trim();
    
    console.log(`\n🔍 ========== OTP VERIFICATION REQUEST ==========`);
    console.log(`📧 Received email: "${email}"`);
    console.log(`📧 Normalized email: "${normalizedEmail}"`);
    console.log(`🔑 Received OTP: "${otp}"`);
    console.log(`🔑 Normalized OTP: "${normalizedOtp}"`);
    console.log(`📋 Current OTP storage size: ${otpStorage.size}`);
    console.log(`📋 All stored email keys:`, Array.from(otpStorage.keys()));

    // Try to find the OTP - check both normalized and original email
    let storedData = otpStorage.get(normalizedEmail);
    
    // If not found with normalized, try original email (for backward compatibility)
    if (!storedData && email !== normalizedEmail) {
      console.log(`⚠️  Not found with normalized email, trying original: "${email}"`);
      storedData = otpStorage.get(email);
    }
    
    if (!storedData) {
      console.log(`❌ No OTP found for "${normalizedEmail}"`);
      console.log(`💡 Available emails in storage:`, Array.from(otpStorage.keys()));
      console.log(`💡 Tip: Make sure you've sent an OTP for this email first`);
      return res.status(400).json({ 
        error: 'OTP expired or not found. Please request a new OTP.',
        debug: {
          requestedEmail: normalizedEmail,
          availableEmails: Array.from(otpStorage.keys()),
          storageSize: otpStorage.size
        }
      });
    }

    console.log(`✅ Found stored OTP data:`);
    console.log(`   - Stored OTP: "${storedData.otp}"`);
    console.log(`   - Stored timestamp: ${new Date(storedData.timestamp).toISOString()}`);
    console.log(`   - Current time: ${new Date().toISOString()}`);

    // Check if OTP is expired (10 minutes instead of 5 for better UX)
    const expirationTime = 10 * 60 * 1000; // 10 minutes
    const ageInMs = Date.now() - storedData.timestamp;
    const ageInMinutes = ageInMs / (60 * 1000);
    const remainingMinutes = (expirationTime - ageInMs) / (60 * 1000);
    
    console.log(`⏰ OTP age: ${ageInMinutes.toFixed(2)} minutes`);
    console.log(`⏰ Remaining time: ${remainingMinutes.toFixed(2)} minutes`);
    
    if (ageInMs > expirationTime) {
      console.log(`❌ OTP expired (age: ${ageInMinutes.toFixed(2)} minutes, limit: 10 minutes)`);
      otpStorage.delete(normalizedEmail);
      return res.status(400).json({ 
        error: `OTP has expired (${ageInMinutes.toFixed(1)} minutes old). Please request a new OTP.`,
        age: ageInMinutes.toFixed(2)
      });
    }
    
    console.log(`⏰ OTP is valid (age: ${ageInMinutes.toFixed(2)} minutes, remaining: ${remainingMinutes.toFixed(2)} minutes)`);

    // Compare OTP (as strings to handle leading zeros)
    const storedOtpStr = storedData.otp.toString().trim();
    console.log(`🔑 Comparing OTPs:`);
    console.log(`   - Stored: "${storedOtpStr}" (type: ${typeof storedOtpStr})`);
    console.log(`   - Entered: "${normalizedOtp}" (type: ${typeof normalizedOtp})`);
    console.log(`   - Match: ${storedOtpStr === normalizedOtp}`);
    
    if (storedOtpStr !== normalizedOtp) {
      console.log(`❌ OTP mismatch!`);
      console.log(`   Expected: "${storedOtpStr}"`);
      console.log(`   Got: "${normalizedOtp}"`);
      return res.status(400).json({ 
        error: 'Invalid OTP. Please check and try again.',
        debug: {
          expected: storedOtpStr,
          received: normalizedOtp
        }
      });
    }

    console.log(`✅ OTP verified successfully for ${normalizedEmail}`);
    console.log(`==========================================\n`);

    // Remove OTP after successful verification
    otpStorage.delete(normalizedEmail);
    
    res.json({ success: true, message: 'OTP verified successfully' });
    
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// Send admin notification when new tutor signs up
app.post('/api/notify-admin-new-tutor', async (req, res) => {
  try {
    const { tutorName, tutorEmail, tutorPhone } = req.body;
    
    if (!tutorName || !tutorEmail) {
      return res.status(400).json({ error: 'Tutor name and email are required' });
    }

    const mailOptions = {
      from: 'teachlypro720@gmail.com',
      to: 'chauhanmonika7017@gmail.com', // Admin email
      subject: `New Tutor Application - ${tutorName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Admin Notification</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">New Tutor Application Received</h2>
            <p>Hello Admin,</p>
            <p>A new tutor has submitted their application and is waiting for your approval.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5;">
              <h3 style="color: #4F46E5; margin-top: 0;">Tutor Details:</h3>
              <p><strong>Name:</strong> ${tutorName}</p>
              <p><strong>Email:</strong> ${tutorEmail}</p>
              ${tutorPhone ? `<p><strong>Phone:</strong> ${tutorPhone}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${FRONTEND_URL}/admin-dashboard" 
                 style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Review Application
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Please log in to the admin dashboard to review and approve this tutor application.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro System</strong>
            </p>
          </div>
        </div>
      `
    };

    const result = await sendEmailWithFallback(mailOptions);
    
    res.json({ 
      success: true, 
      message: 'Admin notification sent successfully', 
      service: result.service
    });
    
  } catch (error) {
    console.error('Error sending admin notification:', error);
    res.status(500).json({ error: 'Failed to send admin notification' });
  }
});

// Send booking approval emails to both student and teacher
app.post('/api/send-booking-approval-emails', async (req, res) => {
  try {
    const { studentEmail, studentName, teacherEmail, teacherName, bookingDetails } = req.body;
    
    if (!studentEmail || !teacherEmail || !bookingDetails) {
      return res.status(400).json({ error: 'Student email, teacher email, and booking details are required' });
    }

    // Email to Student
    const studentMailOptions = {
      from: 'teachlypro720@gmail.com',
      to: studentEmail,
      subject: `Booking Approved - ${teacherName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Booking Approved</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Great News, ${studentName}!</h2>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
              <h3 style="color: #16a34a; margin-top: 0;">Class Details:</h3>
              <p><strong>Teacher:</strong> ${teacherName}</p>
              <p><strong>Date:</strong> ${bookingDetails.date}</p>
              <p><strong>Time:</strong> ${bookingDetails.time}</p>
              <p><strong>Duration:</strong> ${bookingDetails.duration || '50 minutes'}</p>
              <p><strong>Type:</strong> ${bookingDetails.type || 'Trial Class'}</p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Please make sure to attend the class at the scheduled time. If you need to reschedule, please contact us in advance.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong>
            </p>
          </div>
        </div>
      `
    };

    // Email to Teacher
    const teacherMailOptions = {
      from: 'teachlypro720@gmail.com',
      to: teacherEmail,
      subject: `New Booking Approved - ${studentName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">New Booking Approved</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">New Class Scheduled, ${teacherName}!</h2>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <h3 style="color: #2563eb; margin-top: 0;">Class Details:</h3>
              <p><strong>Student:</strong> ${studentName}</p>
              <p><strong>Date:</strong> ${bookingDetails.date}</p>
              <p><strong>Time:</strong> ${bookingDetails.time}</p>
              <p><strong>Duration:</strong> ${bookingDetails.duration || '50 minutes'}</p>
              <p><strong>Type:</strong> ${bookingDetails.type || 'Trial Class'}</p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Please prepare for the class and ensure you're available at the scheduled time.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong>
            </p>
          </div>
        </div>
      `
    };

    // Send both emails
    const [studentResult, teacherResult] = await Promise.all([
      sendEmailWithFallback(studentMailOptions),
      sendEmailWithFallback(teacherMailOptions)
    ]);
    
    res.json({ 
      success: true, 
      message: 'Booking approval emails sent successfully',
      studentEmail: { success: true, service: studentResult.service },
      teacherEmail: { success: true, service: teacherResult.service }
    });
    
  } catch (error) {
    console.error('Error sending booking approval emails:', error);
    res.status(500).json({ error: 'Failed to send booking approval emails' });
  }
});

// Send reschedule emails to both student and teacher
app.post('/api/send-reschedule-emails', async (req, res) => {
  try {
    const { studentEmail, studentName, teacherEmail, teacherName, oldBooking, newBooking } = req.body;
    
    if (!studentEmail || !teacherEmail || !oldBooking || !newBooking) {
      return res.status(400).json({ error: 'All booking details are required' });
    }

    // Email to Student
    const studentMailOptions = {
      from: 'teachlypro720@gmail.com',
      to: studentEmail,
      subject: `Class Rescheduled - ${teacherName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Class Rescheduled</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Class Rescheduled, ${studentName}!</h2>
            <p>Your class with <strong>${teacherName}</strong> has been rescheduled.</p>
            
            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <h4 style="color: #92400e; margin-top: 0;">Previous Schedule:</h4>
              <p><strong>Date:</strong> ${oldBooking.date}</p>
              <p><strong>Time:</strong> ${oldBooking.time}</p>
            </div>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <h3 style="color: #f59e0b; margin-top: 0;">New Schedule:</h3>
              <p><strong>Date:</strong> ${newBooking.date}</p>
              <p><strong>Time:</strong> ${newBooking.time}</p>
              <p><strong>Duration:</strong> ${newBooking.duration || '50 minutes'}</p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Please note the new schedule and attend the class at the updated time.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong>
            </p>
          </div>
        </div>
      `
    };

    // Email to Teacher
    const teacherMailOptions = {
      from: 'teachlypro720@gmail.com',
      to: teacherEmail,
      subject: `Class Rescheduled - ${studentName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Class Rescheduled</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Class Rescheduled, ${teacherName}!</h2>
            <p>Your class with <strong>${studentName}</strong> has been rescheduled.</p>
            
            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <h4 style="color: #92400e; margin-top: 0;">Previous Schedule:</h4>
              <p><strong>Date:</strong> ${oldBooking.date}</p>
              <p><strong>Time:</strong> ${oldBooking.time}</p>
            </div>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <h3 style="color: #f59e0b; margin-top: 0;">New Schedule:</h3>
              <p><strong>Date:</strong> ${newBooking.date}</p>
              <p><strong>Time:</strong> ${newBooking.time}</p>
              <p><strong>Duration:</strong> ${newBooking.duration || '50 minutes'}</p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Please note the new schedule and be available for the class at the updated time.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong>
            </p>
          </div>
        </div>
      `
    };

    // Send both emails
    const [studentResult, teacherResult] = await Promise.all([
      sendEmailWithFallback(studentMailOptions),
      sendEmailWithFallback(teacherMailOptions)
    ]);
    
    res.json({ 
      success: true, 
      message: 'Reschedule emails sent successfully',
      studentEmail: { success: true, service: studentResult.service },
      teacherEmail: { success: true, service: teacherResult.service }
    });
    
  } catch (error) {
    console.error('Error sending reschedule emails:', error);
    res.status(500).json({ error: 'Failed to send reschedule emails' });
  }
});

// Send finished class emails to both student and teacher
app.post('/api/send-finished-class-emails', async (req, res) => {
  try {
    const { studentEmail, studentName, teacherEmail, teacherName, bookingDetails } = req.body;
    
    if (!studentEmail || !teacherEmail || !bookingDetails) {
      return res.status(400).json({ error: 'Student email, teacher email, and booking details are required' });
    }

    // Email to Student
    const studentMailOptions = {
      from: 'teachlypro720@gmail.com',
      to: studentEmail,
      subject: `Class Completed - ${teacherName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Class Completed</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Class Completed, ${studentName}!</h2>
            <p>Your class with <strong>${teacherName}</strong> has been completed successfully.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
              <h3 style="color: #16a34a; margin-top: 0;">Class Details:</h3>
              <p><strong>Teacher:</strong> ${teacherName}</p>
              <p><strong>Date:</strong> ${bookingDetails.date}</p>
              <p><strong>Time:</strong> ${bookingDetails.time}</p>
              <p><strong>Duration:</strong> ${bookingDetails.duration || '50 minutes'}</p>
              <p><strong>Type:</strong> ${bookingDetails.type || 'Trial Class'}</p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Thank you for attending the class! We hope you found it helpful. Feel free to book more classes with your teacher.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong>
            </p>
          </div>
        </div>
      `
    };

    // Email to Teacher
    const teacherMailOptions = {
      from: 'teachlypro720@gmail.com',
      to: teacherEmail,
      subject: `Class Completed - ${studentName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Class Completed</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Class Completed, ${teacherName}!</h2>
            <p>Your class with <strong>${studentName}</strong> has been completed successfully.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
              <h3 style="color: #16a34a; margin-top: 0;">Class Details:</h3>
              <p><strong>Student:</strong> ${studentName}</p>
              <p><strong>Date:</strong> ${bookingDetails.date}</p>
              <p><strong>Time:</strong> ${bookingDetails.time}</p>
              <p><strong>Duration:</strong> ${bookingDetails.duration || '50 minutes'}</p>
              <p><strong>Type:</strong> ${bookingDetails.type || 'Trial Class'}</p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Great job on completing the class! Your earnings will be updated accordingly.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong>
            </p>
          </div>
        </div>
      `
    };

    // Send both emails
    const [studentResult, teacherResult] = await Promise.all([
      sendEmailWithFallback(studentMailOptions),
      sendEmailWithFallback(teacherMailOptions)
    ]);
    
    res.json({ 
      success: true, 
      message: 'Finished class emails sent successfully',
      studentEmail: { success: true, service: studentResult.service },
      teacherEmail: { success: true, service: teacherResult.service }
    });
    
  } catch (error) {
    console.error('Error sending finished class emails:', error);
    res.status(500).json({ error: 'Failed to send finished class emails' });
  }
});

// Send cancelled class emails to both student and teacher
// Send contact reply email
app.post('/api/send-contact-reply', async (req, res) => {
  try {
    const { to, userName, subject, originalMessage, reply } = req.body;
    
    if (!to || !userName || !subject || !reply) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const mailOptions = {
      from: 'teachlypro720@gmail.com',
      to: to,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Response to Your Inquiry</h2>
            <p>Hello ${userName},</p>
            <p>Thank you for contacting us. We have received your message and here is our response:</p>
            
            ${originalMessage ? `
            <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5;">
              <p style="margin: 0; font-weight: bold; color: #666; font-size: 14px;">Your Original Message:</p>
              <p style="margin: 5px 0 0 0; color: #333; white-space: pre-wrap;">${originalMessage}</p>
            </div>
            ` : ''}
            
            <div style="background-color: #E0E7FF; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5;">
              <p style="margin: 0; font-weight: bold; color: #4F46E5; font-size: 14px;">Our Response:</p>
              <p style="margin: 5px 0 0 0; color: #333; white-space: pre-wrap;">${reply}</p>
            </div>
            
            <p>If you have any further questions or concerns, please don't hesitate to contact us again.</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong><br>
              Email: teachlypro720@gmail.com
            </p>
          </div>
        </div>
      `
    };

    try {
      await sendEmailWithFallback(mailOptions);
      res.json({ success: true, message: 'Reply email sent successfully' });
    } catch (emailError) {
      console.error('Error sending contact reply email:', emailError);
      res.status(500).json({ error: 'Failed to send reply email', details: emailError.message });
    }
  } catch (error) {
    console.error('Error in send-contact-reply endpoint:', error);
    res.status(500).json({ error: 'Failed to process reply request' });
  }
});

app.post('/api/send-cancelled-class-emails', async (req, res) => {
  try {
    const { studentEmail, studentName, teacherEmail, teacherName, bookingDetails, reason } = req.body;
    
    if (!studentEmail || !teacherEmail || !bookingDetails) {
      return res.status(400).json({ error: 'Student email, teacher email, and booking details are required' });
    }

    // Email to Student
    const studentMailOptions = {
      from: 'teachlypro720@gmail.com',
      to: studentEmail,
      subject: `Class Cancelled - ${teacherName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Class Cancelled</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Class Cancelled, ${studentName}</h2>
            <p>Your class with <strong>${teacherName}</strong> has been cancelled.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
              <h3 style="color: #dc2626; margin-top: 0;">Cancelled Class Details:</h3>
              <p><strong>Teacher:</strong> ${teacherName}</p>
              <p><strong>Date:</strong> ${bookingDetails.date}</p>
              <p><strong>Time:</strong> ${bookingDetails.time}</p>
              <p><strong>Duration:</strong> ${bookingDetails.duration || '50 minutes'}</p>
              <p><strong>Type:</strong> ${bookingDetails.type || 'Trial Class'}</p>
              ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            </div>
            
            <p style="color: #666; font-size: 14px;">
              We apologize for any inconvenience. You can book a new class with the same teacher or choose a different teacher.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong>
            </p>
          </div>
        </div>
      `
    };

    // Email to Teacher
    const teacherMailOptions = {
      from: 'teachlypro720@gmail.com',
      to: teacherEmail,
      subject: `Class Cancelled - ${studentName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Class Cancelled</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Class Cancelled, ${teacherName}</h2>
            <p>Your class with <strong>${studentName}</strong> has been cancelled.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
              <h3 style="color: #dc2626; margin-top: 0;">Cancelled Class Details:</h3>
              <p><strong>Student:</strong> ${studentName}</p>
              <p><strong>Date:</strong> ${bookingDetails.date}</p>
              <p><strong>Time:</strong> ${bookingDetails.time}</p>
              <p><strong>Duration:</strong> ${bookingDetails.duration || '50 minutes'}</p>
              <p><strong>Type:</strong> ${bookingDetails.type || 'Trial Class'}</p>
              ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            </div>
            
            <p style="color: #666; font-size: 14px;">
              The class has been cancelled. Your schedule is now free for this time slot.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong>
            </p>
          </div>
        </div>
      `
    };

    // Send both emails
    const [studentResult, teacherResult] = await Promise.all([
      sendEmailWithFallback(studentMailOptions),
      sendEmailWithFallback(teacherMailOptions)
    ]);
    
    res.json({ 
      success: true, 
      message: 'Cancelled class emails sent successfully',
      studentEmail: { success: true, service: studentResult.service },
      teacherEmail: { success: true, service: teacherResult.service }
    });
    
  } catch (error) {
    console.error('Error sending cancelled class emails:', error);
    res.status(500).json({ error: 'Failed to send cancelled class emails' });
  }
});

// Send tutor approval email
app.post('/api/send-tutor-approval', async (req, res) => {
  try {
    const { tutorEmail, tutorName } = req.body;
    
    if (!tutorEmail || !tutorName) {
      return res.status(400).json({ error: 'Tutor email and name are required' });
    }

    const mailOptions = {
      from: 'teachlypro720@gmail.com',
      to: tutorEmail,
      subject: '🎉 Congratulations! Your Tutor Application Has Been Approved - Teachly Pro',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #16a34a 0%, #10b981 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">🎉 Congratulations! 🎉</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 18px;">Teachly Pro</p>
            <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 16px;">Application Approved</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Dear ${tutorName},</h2>
            <p style="font-size: 16px; line-height: 1.6;">We are thrilled to inform you that your tutor application has been <strong style="color: #16a34a;">APPROVED</strong>!</p>
            
            <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); padding: 25px; border-radius: 8px; margin: 25px 0; border: 2px solid #16a34a;">
              <h3 style="color: #16a34a; margin-top: 0; font-size: 20px;">✨ Welcome to Our Teaching Team! ✨</h3>
              <p style="color: #065f46; font-size: 15px; line-height: 1.7; margin-bottom: 15px;">
                Your application has been reviewed and accepted. We're excited to have you join our platform as a tutor!
              </p>
            </div>
            
            <div style="background-color: white; padding: 25px; border-radius: 8px; margin: 25px 0; border-left: 5px solid #16a34a; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <h3 style="color: #16a34a; margin-top: 0; font-size: 18px;">🚀 You Can Now Login!</h3>
              <p style="color: #333; font-size: 15px; line-height: 1.7; margin-bottom: 15px;">
                <strong>Your account is now active!</strong> You can log in to your tutor dashboard using your registered email and password.
              </p>
              <div style="background-color: #f0fdf4; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <p style="margin: 0; color: #065f46; font-size: 14px;">
                  <strong>Login Steps:</strong><br>
                  1. Go to the tutor login page<br>
                  2. Enter your email: <strong>${tutorEmail}</strong><br>
                  3. Enter your password<br>
                  4. Start accepting bookings from students!
                </p>
              </div>
              <p style="color: #333; font-size: 15px; line-height: 1.7; margin-top: 15px;">
                Once logged in, you'll be able to:
              </p>
              <ul style="color: #333; font-size: 14px; line-height: 1.8; padding-left: 20px;">
                <li>View and manage your bookings</li>
                <li>Set your availability schedule</li>
                <li>Communicate with students</li>
                <li>Track your earnings</li>
                <li>Update your profile</li>
              </ul>
            </div>
            
            <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
              <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.6;">
                <strong>💡 Tip:</strong> Make sure to complete your profile and set your availability to start receiving booking requests from students.
              </p>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              We're here to support you every step of the way. If you have any questions or need assistance, please don't hesitate to reach out to us.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #16a34a; font-size: 18px; font-weight: bold; margin: 0;">
                Welcome aboard! 🎓
              </p>
            </div>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              Best regards,<br>
              <strong style="color: #333;">Teachly Pro Team</strong><br>
              📧 Email: teachlypro720@gmail.com<br>
            </p>
          </div>
        </div>
      `
    };

    const result = await sendEmailWithFallback(mailOptions);
    
    res.json({ 
      success: true, 
      message: 'Tutor approval email sent successfully',
      service: result.service
    });
    
  } catch (error) {
    console.error('Error sending tutor approval email:', error);
    res.status(500).json({ error: 'Failed to send tutor approval email' });
  }
});

// Send tutor rejection email with reason
app.post('/api/send-tutor-rejection', async (req, res) => {
  try {
    const { tutorEmail, tutorName, reason } = req.body;
    
    if (!tutorEmail || !tutorName) {
      return res.status(400).json({ error: 'Tutor email and name are required' });
    }

    const rejectionReason = reason || 'Application rejected by admin';

    const mailOptions = {
      from: 'teachlypro720@gmail.com',
      to: tutorEmail,
      subject: 'Tutor Application Status - Teachly Pro',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Application Status</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Dear ${tutorName},</h2>
            <p>Thank you for your interest in joining Teachly Pro as a tutor.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
              <h3 style="color: #dc2626; margin-top: 0;">Application Status</h3>
              <p>We regret to inform you that your tutor application has not been approved at this time.</p>
              
              <div style="background-color: #fef2f2; padding: 15px; border-radius: 6px; margin: 15px 0; border: 1px solid #fecaca;">
                <h4 style="color: #991b1b; margin-top: 0; margin-bottom: 10px;">Reason for Rejection:</h4>
                <p style="color: #7f1d1d; margin: 0; line-height: 1.6;">${rejectionReason}</p>
              </div>
            </div>
            
            <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <p style="color: #92400e; margin: 0 0 10px 0; line-height: 1.6;">
                <strong>Note:</strong> We encourage you to address the concerns mentioned above and resubmit your application.
              </p>
              <p style="color: #92400e; margin: 0; line-height: 1.6;">
                You can login with your credentials and resubmit your documents. Your application will be reviewed again after resubmission.
              </p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              If you have any questions about this decision, please feel free to contact us.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong><br>
              Email: teachlypro720@gmail.com
            </p>
          </div>
        </div>
      `
    };

    console.log('Attempting to send rejection email to:', tutorEmail);
    console.log('Tutor name:', tutorName);
    console.log('Rejection reason:', rejectionReason);
    
    const result = await sendEmailWithFallback(mailOptions);
    
    console.log('Email sent successfully via:', result.service);
    
    res.json({ 
      success: true, 
      message: 'Tutor rejection email sent successfully',
      service: result.service
    });
    
  } catch (error) {
    console.error('Error sending tutor rejection email:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      response: error.response,
      responseCode: error.responseCode,
      command: error.command
    });
    res.status(500).json({ 
      error: 'Failed to send tutor rejection email',
      details: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// WebRTC signaling endpoints
const signalingData = new Map(); // In-memory storage for signaling data

// Store signaling data
app.post('/api/webrtc-signaling', (req, res) => {
  try {
    const { type, offer, answer, candidate, roomId, from } = req.body;
    
    // Validate required fields
    if (!type || !roomId || !from) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const signalingKey = `${roomId}-${type}-${Date.now()}`;
    signalingData.set(signalingKey, {
      type,
      offer,
      answer,
      candidate,
      roomId,
      from,
      timestamp: Date.now()
    });
    
    console.log(`📡 Stored signaling data: ${type} from ${from} for room ${roomId}`);
    
    // Clean up old signaling data (older than 30 seconds)
    const now = Date.now();
    for (const [key, data] of signalingData.entries()) {
      if (now - data.timestamp > 30000) {
        signalingData.delete(key);
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error storing signaling data:', error);
    res.status(500).json({ error: 'Failed to store signaling data' });
  }
});

// Get signaling data
app.get('/api/webrtc-signaling/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;
    const { from } = req.query;
    
    console.log(`📥 Getting signaling data for room ${roomId} from ${from}`);
    
    // Find the latest signaling data for this room
    let latestData = null;
    let latestTimestamp = 0;
    let latestKey = null;
    
    for (const [key, data] of signalingData.entries()) {
      if (data.roomId === roomId && data.from !== from && data.timestamp > latestTimestamp) {
        latestData = data;
        latestTimestamp = data.timestamp;
        latestKey = key;
      }
    }
    
    if (latestData) {
      console.log(`✅ Found signaling data: ${latestData.type} from ${latestData.from}`);
      // Remove the data after sending
      signalingData.delete(latestKey);
      res.json(latestData);
    } else {
      console.log('❌ No signaling data found');
      res.json(null);
    }
  } catch (error) {
    console.error('❌ Error getting signaling data:', error);
    res.status(500).json({ error: 'Failed to get signaling data' });
  }
});

// Health check endpoint for production
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    signalingDataSize: signalingData.size
  });
});

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const mailOptions = {
      from: 'teachlypro720@gmail.com',
      to: email,
      subject: "Test Email from Teachly Pro",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333;">Test Email</h2>
            <p>Hello!</p>
            <p>This is a test email to verify that our email service is working correctly.</p>
            <p>If you received this email, the email service is functioning properly.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong>
            </p>
          </div>
        </div>
      `
    };

    const result = await sendEmailWithFallback(mailOptions);
    
    res.json({ 
      success: true, 
      message: 'Test email sent successfully', 
      service: result.service
    });
    
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// Send custom password reset email
app.post('/api/send-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Generate a simple reset token (in production, use a more secure method)
    const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const mailOptions = {
      from: 'teachlypro720@gmail.com',
      to: email,
      subject: 'Reset your password for Teachly Pro',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Teachly Pro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Password Reset Request</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>
            <p>Hello!</p>
            <p>We received a request to reset your password for your Teachly Pro account.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5;">
              <h3 style="color: #4F46E5; margin-top: 0;">To reset your password:</h3>
              <p>1. Click the button below to reset your password</p>
              <p>2. You will be redirected to our password reset page</p>
              <p>3. Enter your new password</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${FRONTEND_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}" 
                 style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Reset My Password
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              <strong>Important:</strong> This link will expire in 1 hour for security reasons.
            </p>
            
            <p style="color: #666; font-size: 14px;">
              If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>Teachly Pro Team</strong><br>
              Email: teachlypro720@gmail.com
            </p>
          </div>
        </div>
      `
    };

    const result = await sendEmailWithFallback(mailOptions);
    
    res.json({ 
      success: true, 
      message: 'Password reset email sent successfully',
      service: result.service
    });
    
  } catch (error) {
    console.error('Error sending password reset email:', error);
    res.status(500).json({ error: 'Failed to send password reset email' });
  }
});

// Razorpay: Create Order
app.post('/api/create-razorpay-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || 
        RAZORPAY_KEY_ID === 'YOUR_RAZORPAY_KEY_ID' || 
        RAZORPAY_KEY_SECRET === 'YOUR_RAZORPAY_KEY_SECRET') {
      return res.status(500).json({ 
        success: false,
        error: 'Razorpay credentials not configured. Please add your Razorpay Key ID and Key Secret in server.js' 
      });
    }

    const options = {
      amount: amount, // Amount in paise (smallest currency unit)
      currency: currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes: notes || {}
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order: order,
      keyId: RAZORPAY_KEY_ID // Send key ID to frontend
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create payment order',
      details: error.error?.description || 'Please check Razorpay credentials'
    });
  }
});

// Razorpay: Verify Payment
app.post('/api/verify-razorpay-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingData, teacher } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification data missing' });
    }

    // Generate signature for verification
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generated_signature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    // Verify signature
    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ 
        success: false,
        error: 'Payment verification failed: Invalid signature' 
      });
    }

    // Payment verified successfully
    // Here you would typically:
    // 1. Save booking to database
    // 2. Send confirmation emails
    // 3. Update user's session count
    
    console.log('Payment verified successfully:', {
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      bookingData: bookingData
    });

    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id
    });

  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to verify payment' 
    });
  }
});

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0'; // Bind to 0.0.0.0 for cloud deployment

app.listen(PORT, HOST, () => {
  console.log(`🚀 Enhanced Server running on ${HOST}:${PORT}`);
  console.log(`📧 Email services configured: ${transporters.map(t => t.name).join(', ')}`);
  console.log(`🔒 CORS enabled`);
  console.log(`⚡ Performance optimizations active`);
  console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
});
