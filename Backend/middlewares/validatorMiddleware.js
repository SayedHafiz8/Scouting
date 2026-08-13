import { validationResult } from "express-validator";

const validatorMiddleware = (req, res, next) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        return res.status(400).json({ status: "fail", errors: result.array() });
    }
    next();
}

export default validatorMiddleware;