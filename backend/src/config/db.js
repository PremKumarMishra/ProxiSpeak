const mongoose = require("mongoose");

const connectDB = async () => 
{
    try
    {
        const conn =  await mongoose.connect(process.env.MONGO_URI);
        console.log("Mongodb Connection Successful : ",conn.connection.host);
    }

    catch (error)
    {
        console.log("Mongodb Connection Failed: ",error.message);
        process.exit(1);
    }
}

module.exports = connectDB;
