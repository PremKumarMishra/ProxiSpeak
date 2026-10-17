const mongoose = require("mongoose");

const connectDB = async () => 
{
    try
    {
        if (!process.env.MONGO_URI) {
            console.log("No MONGO_URI provided in environment. Running in offline/in-memory mode.");
            return;
        }
        const conn =  await mongoose.connect(process.env.MONGO_URI);
        console.log("Mongodb Connection Successful : ",conn.connection.host);
    }

    catch (error)
    {
        console.log("Mongodb Connection Failed: ",error.message);
    }
}

module.exports = connectDB;
