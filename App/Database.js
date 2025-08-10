// author @GwenDev
import mysql from "mysql2/promise";

const dbConfig = {
    host: "localhost",     
    user: "root",          
    password: "",          
    database: "zgwen",   
    port: 3306             
};

const pool = mysql.createPool(dbConfig);

export async function query(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

export default pool;
