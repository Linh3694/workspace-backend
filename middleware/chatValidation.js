const { body, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// Rate limiting cho chat endpoints
const chatRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    max: 60, // Tối đa 60 requests/phút
    message: {
        error: 'Quá nhiều yêu cầu, vui lòng thử lại sau'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const messageRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    max: 30, // Tối đa 30 tin nhắn/phút
    message: {
        error: 'Gửi tin nhắn quá nhanh, vui lòng chậm lại'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Validation rules
const createChatValidation = [
    body('participantId')
        .isMongoId()
        .withMessage('ID người tham gia không hợp lệ')
        .notEmpty()
        .withMessage('ID người tham gia là bắt buộc'),
];

const sendMessageValidation = [
    body('chatId')
        .isMongoId()
        .withMessage('ID chat không hợp lệ')
        .notEmpty()
        .withMessage('ID chat là bắt buộc'),
    body('content')
        .trim()
        .isLength({ min: 1, max: 2000 })
        .withMessage('Nội dung tin nhắn phải từ 1-2000 ký tự')
        .custom((value) => {
            // Kiểm tra nội dung không chỉ chứa khoảng trắng
            if (!value || value.trim().length === 0) {
                throw new Error('Nội dung tin nhắn không được để trống');
            }
            return true;
        }),
    body('type')
        .optional()
        .isIn(['text', 'image', 'file', 'multiple-images'])
        .withMessage('Loại tin nhắn không hợp lệ'),
    body('tempId')
        .optional()
        .isString()
        .isLength({ max: 100 })
        .withMessage('Temp ID không hợp lệ'),
];

const getChatMessagesValidation = [
    param('chatId')
        .isMongoId()
        .withMessage('ID chat không hợp lệ'),
    body('page')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Số trang phải từ 1-1000'),
    body('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('Giới hạn phải từ 1-50'),
];

const reactionValidation = [
    param('messageId')
        .isMongoId()
        .withMessage('ID tin nhắn không hợp lệ'),
    body('emojiCode')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Mã emoji không hợp lệ'),
    body('isCustom')
        .optional()
        .isBoolean()
        .withMessage('isCustom phải là boolean'),
];

const forwardMessageValidation = [
    body('messageId')
        .isMongoId()
        .withMessage('ID tin nhắn không hợp lệ'),
    body('toUserId')
        .isMongoId()
        .withMessage('ID người nhận không hợp lệ'),
];

// File upload validation
const validateFileUpload = (req, res, next) => {
    if (!req.file && !req.files) {
        return res.status(400).json({ 
            message: 'Không có file được upload' 
        });
    }

    const allowedMimeTypes = [
        'image/jpeg',
        'image/png', 
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
    ];

    const maxFileSize = 10 * 1024 * 1024; // 10MB

    const files = req.files || [req.file];
    
    for (const file of files) {
        if (!allowedMimeTypes.includes(file.mimetype)) {
            return res.status(400).json({
                message: `Loại file ${file.mimetype} không được hỗ trợ`
            });
        }

        if (file.size > maxFileSize) {
            return res.status(400).json({
                message: `File ${file.originalname} quá lớn (tối đa 10MB)`
            });
        }
    }

    next();
};

// Content filtering
const contentFilter = (req, res, next) => {
    if (req.body.content) {
        const content = req.body.content.toLowerCase();
        const bannedWords = ['spam', 'hack', 'virus']; // Có thể mở rộng
        
        const containsBannedWord = bannedWords.some(word => 
            content.includes(word)
        );

        if (containsBannedWord) {
            return res.status(400).json({
                message: 'Nội dung tin nhắn chứa từ ngữ không phù hợp'
            });
        }
    }
    next();
};

// Error handler cho validation
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: 'Dữ liệu không hợp lệ',
            errors: errors.array()
        });
    }
    next();
};

module.exports = {
    chatRateLimit,
    messageRateLimit,
    createChatValidation,
    sendMessageValidation,
    getChatMessagesValidation,
    reactionValidation,
    forwardMessageValidation,
    validateFileUpload,
    contentFilter,
    handleValidationErrors
}; 