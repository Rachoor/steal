var stealClone = require('steal-clone');

// test when parent of injected module has been imported prior to cloning
var origModuleA = require('ext-steal-clone/prior-import/moduleA');

var clone = stealClone({
  'ext-steal-clone/prior-import/moduleB': {
    getName: function() {
      return 'mockModuleB';
    }
  }
});

clone.import('ext-steal-clone/prior-import/moduleA')
  .then(function(moduleA) {
    if (typeof window !== "undefined" && window.assert) {
      assert.equal(moduleA.getName(), 'moduleA mockModuleB', 'import should use injected dependency');
      assert.equal(origModuleA.getName(), 'moduleA moduleB', 'prior import should use original dependency');

      done();
    } else {
      console.log('moduleA.getName():', moduleA.getName());
      console.log('origModuleA.getName():', origModuleA.getName());
    }
  });
