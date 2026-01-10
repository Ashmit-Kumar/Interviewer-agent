import mongoose from 'mongoose';

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/interview-platform';
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔧 MONGODB CONNECTION (Backend)`);
    console.log(`${'='.repeat(60)}`);
    console.log(`MongoDB URI: ${mongoUri.substring(0, 30)}...${mongoUri.slice(-20)}`);
    console.log(`Database: interview-platform (from URI path)`);
    console.log(`${'='.repeat(60)}\n`);
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      maxPoolSize: 10,
      minPoolSize: 2,
    });
    
    mongoose.connection.on('connected', () => {
      console.log('✓ MongoDB connected');
      // console.log(`  Active database: ${mongoose.connection.db.databaseName}`);
    });

    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.connection.close();
};
