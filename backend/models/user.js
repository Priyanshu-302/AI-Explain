const mongoose = require('mongoose');

const userSchema = mongoose.Schema(
    {
        username: { 
            type: String,
            required: [true, 'Please add a username'],
            unique: true, 
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Please add an email'],
            unique: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                'Please use a valid email address',
            ],
        },
        password: {
            type: String,
            required: [true, 'Please add a password'],
            minlength: 6,
            select: false, 
        },
        role: {
            type: String,
            enum: ['Basic', 'Pro'],
            default: 'Basic',
        },
        credits: {
            type: Number,
            default: 50, 
        },
        resetPasswordToken: String,
        resetPasswordExpire: Date,
    },
    {
        timestamps: true,
    }
);


module.exports = mongoose.model('user', userSchema);