import mongoose from "mongoose";

const ageGroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    birthYear: {
        type: Number,
        required: true,
        unique: true,
        min: 2007,
        max: 2019
    }
});

const AgeGroup = mongoose.model('AgeGroup', ageGroupSchema);
export default AgeGroup;