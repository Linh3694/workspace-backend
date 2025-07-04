const mongoose = require("mongoose");

const microsoftUserSchema = new mongoose.Schema({
  // Microsoft Graph API fields
  id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  
  givenName: {
    type: String,
    trim: true
  },
  
  surname: {
    type: String,
    trim: true
  },
  
  userPrincipalName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  mail: {
    type: String,
    trim: true,
    sparse: true
  },
  
  jobTitle: {
    type: String,
    trim: true
  },
  
  department: {
    type: String,
    trim: true
  },
  
  officeLocation: {
    type: String,
    trim: true
  },
  
  businessPhones: [{
    type: String,
    trim: true
  }],
  
  mobilePhone: {
    type: String,
    trim: true
  },
  
  employeeId: {
    type: String,
    trim: true,
    sparse: true
  },
  
  employeeType: {
    type: String,
    trim: true
  },
  
  accountEnabled: {
    type: Boolean,
    default: true
  },
  
  // Additional Microsoft fields
  preferredLanguage: {
    type: String,
    trim: true
  },
  
  usageLocation: {
    type: String,
    trim: true
  },
  
  // Sync status
  lastSyncAt: {
    type: Date,
    default: Date.now
  },
  
  syncStatus: {
    type: String,
    enum: ['pending', 'synced', 'failed', 'deleted'],
    default: 'pending'
  },
  
  syncError: {
    type: String,
    trim: true
  },
  
  // Mapping to local User
  mappedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
microsoftUserSchema.index({ id: 1 });
microsoftUserSchema.index({ userPrincipalName: 1 });
microsoftUserSchema.index({ mail: 1 });
microsoftUserSchema.index({ syncStatus: 1 });
microsoftUserSchema.index({ lastSyncAt: 1 });
microsoftUserSchema.index({ mappedUserId: 1 });

// Pre-save middleware to update updatedAt
microsoftUserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to find by Microsoft ID
microsoftUserSchema.statics.findByMicrosoftId = function(microsoftId) {
  return this.findOne({ id: microsoftId });
};

// Static method to find by email
microsoftUserSchema.statics.findByEmail = function(email) {
  return this.findOne({
    $or: [
      { mail: email },
      { userPrincipalName: email }
    ]
  });
};

// Method to map to local user
microsoftUserSchema.methods.mapToLocalUser = function(localUserId) {
  this.mappedUserId = localUserId;
  this.syncStatus = 'synced';
  return this.save();
};

// Method to mark as failed sync
microsoftUserSchema.methods.markSyncFailed = function(error) {
  this.syncStatus = 'failed';
  this.syncError = error;
  return this.save();
};

module.exports = mongoose.model("MicrosoftUser", microsoftUserSchema); 