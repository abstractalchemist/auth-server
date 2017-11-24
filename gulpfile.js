const gulp = require('gulp')
const mocha = require('gulp-mocha');

gulp.task('test', function() {
    return gulp.src('./test/**/*.js').pipe(mocha());
})


gulp.task('default',['test'], function() {
    

    const w = gulp.watch(['src/**/*.js','test/**/*.js'], ['test']);
    w.on('error', function(err) {
	console.log(err);
    })

})
