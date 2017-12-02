const path = require('path')

module.exports = {
    devtool: 'source-map',
    entry: './src/index.jsx',
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: 'bundle.js',
    },
    externals: {
        'elementtree': 'null',
    },
    module: {
        rules: [{
            test: /\.jsx?$/,
            use: {
                loader: 'babel-loader',
                options: {
                    presets: [
                        ['env', { targets: { node: 'current' } }],
                        'react', 'es2015', 'stage-0'
                    ],
                    plugins: [
                        'transform-class-properties',
                        'transform-es3-member-expression-literals',
                        'transform-es3-property-literals'
                    ]
                }
            },
        }, {
            test: /\.less$/,
            use: [{
                loader: "style-loader"
            }, {
                loader: "css-loader",
                options: { url: false }
            }, {
                loader: "less-loader"
            }]
        }]
    }
}