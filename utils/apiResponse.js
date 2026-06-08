exports.ok = (res, data, message = 'Success') => res.json({ success: true, message, data });
exports.created = (res, data, message = 'Created') => res.status(201).json({ success: true, message, data });
