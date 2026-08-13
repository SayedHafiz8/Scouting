import mongoose from "mongoose";



const clientOptions = { serverApi: { version: '1', strict: false, deprecationErrors: true } };
export const dbConnection = async function run() {

    const isProduction = process.env.NODE_ENV === "production";
    const uli = process.env.CONNECTION_STRING;

    await mongoose.connect(uli, {
        ...clientOptions,
        autoIndex: !isProduction,  // في production الـ indexes تُنشأ مسبقاً وليس عند كل startup
    });

    await mongoose.connection.db.admin().command({ ping: 1 });

    if (!isProduction) {
        await mongoose.connection.syncIndexes();
    }

    console.log("Pinged your deployment. You successfully connected to MongoDB! ✅");
}
