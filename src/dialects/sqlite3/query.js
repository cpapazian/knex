
// Adds a raw `where` clause to the query.
QueryBuilder_SQLite3.prototype.whereRaw =
QueryBuilder_SQLite3.prototype.andWhereRaw = function(sql, bindings) {
  // sqlite uses ints for bools, so cast true/false to 1/0
  if (typeof sql === 'boolean') { sql = Number(sql); }
  var raw = (sql instanceof Raw ? sql : new Raw(sql, bindings));
  this._statements.push({
    grouping: 'where',
    type: 'whereRaw',
    value: raw,
    bool: this._bool()
  });
  return this;
};

// The locks are not applicable in SQLite3
QueryCompiler_SQLite3.prototype.forShare =
QueryCompiler_SQLite3.prototype.forUpdate = function() {
  return '';
};

// SQLite requires us to build the multi-row insert as a listing of select with
// unions joining them together. So we'll build out this list of columns and
// then join them all together with select unions to complete the queries.
QueryCompiler_SQLite3.prototype.insert = function() {
  var insert = this.single.insert;
  var sql = 'insert into ' + this.tableName + ' ';

  if (_.isArray(insert) && (insert.length === 1) && _.isEmpty(insert[0])) {
    insert = [];
  }

  if (_.isEmpty(insert) && !_.isFunction(insert)) {
    return sql + 'default values';
  }
  var insertData = this._prepInsert(insert);
  if (_.isString(insertData)) return sql + insertData;
  sql += '(' + this.formatter.columnize(insertData.columns) + ')';
  if (insertData.values.length === 1) {
    return sql + ' values (' + this.formatter.parameterize(insertData.values[0]) + ')';
  }
  var blocks = [];
  for (var i = 0, l = insertData.values.length; i < l; i++) {
    var block = blocks[i] = [];
    var current = insertData.values[i];
    for (var i2 = 0, l2 = insertData.columns.length; i2 < l2; i2++) {
      block.push(this.formatter.parameter(current[i2]) + ' as ' + this.formatter.wrap(insertData.columns[i2]));
    }
    blocks[i] = block.join(', ');
  }
  return sql + ' select ' + blocks.join(' union all select ');
};

// Compile a truncate table statement into SQL.
QueryCompiler_SQLite3.prototype.truncate = function() {
  var table = this.tableName;
  return {
    sql: 'delete from sqlite_sequence where name = ' + this.tableName,
    output: function() {
      return this.query({sql: 'delete from ' + table});
    }
  };
};

// Compiles a `columnInfo` query
QueryCompiler_SQLite3.prototype.columnInfo = function() {
  var column = this.single.columnInfo;
  return {
    sql: 'PRAGMA table_info(' + this.single.table +')',
    output: function(resp) {
      var maxLengthRegex = /.*\((\d+)\)/;
      var out = _.reduce(resp, function (columns, val) {
        var type = val.type;
        var maxLength = (maxLength = type.match(maxLengthRegex)) && maxLength[1];
        type = maxLength ? type.split('(')[0] : type;
        columns[val.name] = {
          type: type.toLowerCase(),
          maxLength: maxLength,
          nullable: !val.notnull,
          defaultValue: val.dflt_value
        };
        return columns;
      }, {});
      return column && out[column] || out;
    }
  };
};

QueryCompiler_SQLite3.prototype.limit = function() {
  var noLimit = !this.single.limit && this.single.limit !== 0;
  if (noLimit && !this.single.offset) return '';

  // Workaround for offset only, see http://stackoverflow.com/questions/10491492/sqllite-with-skip-offset-only-not-limit
  return 'limit ' + this.formatter.parameter((this.single.offset && noLimit) ? -1 : this.single.limit);
};
