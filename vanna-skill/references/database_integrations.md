# Database Integrations

Vanna supports all major databases through SqlRunner implementations.

## PostgreSQL

```python
from vanna.integrations.postgres import PostgresRunner

runner = PostgresRunner(
    host="localhost",
    dbname="mydb",
    user="user",
    password="password",
    port=5432
)

tools.register(RunSqlTool(sql_runner=runner))
```

### With Connection Pool

```python
runner = PostgresRunner(
    host="localhost",
    dbname="mydb",
    user="user",
    password="password",
    port=5432,
    pool_size=10,
    max_overflow=20
)
```

### With SSL

```python
runner = PostgresRunner(
    host="db.example.com",
    dbname="mydb",
    user="user",
    password="password",
    ssl_mode="require",
    ssl_root_cert="/path/to/ca.pem"
)
```

## MySQL

```python
from vanna.integrations.mysql import MySQLRunner

runner = MySQLRunner(
    host="localhost",
    database="mydb",
    user="user",
    password="password",
    port=3306
)
```

### With SSL

```python
runner = MySQLRunner(
    host="db.example.com",
    database="mydb",
    user="user",
    password="password",
    ssl_ca="/path/to/ca.pem"
)
```

## SQLite

```python
from vanna.integrations.sqlite import SqliteRunner

# File-based
runner = SqliteRunner("./database.db")

# In-memory
runner = SqliteRunner(":memory:")
```

## Snowflake

```python
from vanna.integrations.snowflake import SnowflakeRunner

runner = SnowflakeRunner(
    account="xxx.snowflakecomputing.com",
    user="user",
    password="password",
    database="DB",
    schema="PUBLIC",
    warehouse="COMPUTE_WH",
    role="ANALYST"
)
```

### With Key-Pair Authentication

```python
runner = SnowflakeRunner(
    account="xxx.snowflakecomputing.com",
    user="user",
    private_key_path="/path/to/key.pem",
    private_key_passphrase="passphrase",
    database="DB",
    schema="PUBLIC",
    warehouse="COMPUTE_WH"
)
```

## BigQuery

```python
from vanna.integrations.bigquery import BigQueryRunner

# With service account
runner = BigQueryRunner(
    project="my-project",
    credentials_path="./service-account.json"
)

# With default credentials
runner = BigQueryRunner(
    project="my-project"
)
```

### With Dataset

```python
runner = BigQueryRunner(
    project="my-project",
    dataset="analytics",
    credentials_path="./credentials.json"
)
```

## DuckDB

```python
from vanna.integrations.duckdb import DuckDBRunner

# File-based
runner = DuckDBRunner("./analytics.duckdb")

# In-memory
runner = DuckDBRunner(":memory:")
```

### With Extensions

```python
runner = DuckDBRunner(
    path="./data.duckdb",
    extensions=["parquet", "json"]
)
```

## ClickHouse

```python
from vanna.integrations.clickhouse import ClickHouseRunner

runner = ClickHouseRunner(
    host="localhost",
    database="default",
    user="default",
    password="",
    port=9000
)
```

### With HTTP Interface

```python
runner = ClickHouseRunner(
    host="localhost",
    database="default",
    user="default",
    password="",
    port=8123,
    use_http=True
)
```

## Oracle

```python
from vanna.integrations.oracle import OracleRunner

runner = OracleRunner(
    host="localhost",
    service_name="ORCL",
    user="user",
    password="password",
    port=1521
)
```

## SQL Server

```python
from vanna.integrations.sqlserver import SQLServerRunner

runner = SQLServerRunner(
    host="localhost",
    database="mydb",
    user="sa",
    password="password",
    port=1433
)
```

### With Windows Authentication

```python
runner = SQLServerRunner(
    host="localhost",
    database="mydb",
    trusted_connection=True
)
```

## Redshift

```python
from vanna.integrations.redshift import RedshiftRunner

runner = RedshiftRunner(
    host="cluster.xxx.redshift.amazonaws.com",
    database="dev",
    user="user",
    password="password",
    port=5439
)
```

## Custom SqlRunner

Implement your own for unsupported databases:

```python
from vanna.core.sql_runner import SqlRunner
from typing import Any
import pandas as pd

class MyCustomRunner(SqlRunner):
    def __init__(self, connection_string: str):
        self.connection_string = connection_string
    
    async def execute(self, sql: str, user: User) -> pd.DataFrame:
        # Your implementation
        connection = self.get_connection()
        result = connection.execute(sql)
        return pd.DataFrame(result)
    
    async def get_schema(self) -> dict[str, Any]:
        # Return schema information
        return {"tables": [...], "columns": [...]}
```
