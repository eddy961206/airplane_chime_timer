const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isDevelopment = argv.mode === 'development';
  
  return {
    entry: {
      background: './background.js',
      popup: './popup.js',
      'audio-player': './audio-player.js'
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true
    },
    devtool: isDevelopment ? 'cheap-module-source-map' : false,
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.html$/,
          use: {
            loader: 'html-loader',
            options: {
              sources: false
            }
          }
        },
        {
          test: /\.(png|jpg|gif|svg|mp3|m4a|wav)$/,
          type: 'asset/resource',
          generator: {
            filename: 'assets/[name][ext]'
          }
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/components/popup.html',
        filename: 'popup.html',
        chunks: ['popup']
      }),
      new HtmlWebpackPlugin({
        template: './src/components/audio-player.html',
        filename: 'audio-player.html',
        chunks: ['audio-player']
      }),
      new HtmlWebpackPlugin({
        template: './welcome.html',
        filename: 'welcome.html',
        chunks: []
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@modules': path.resolve(__dirname, 'src/modules'),
        '@shared': path.resolve(__dirname, 'src/modules/shared'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@styles': path.resolve(__dirname, 'src/styles'),
        '@assets': path.resolve(__dirname, 'src/assets')
      }
    },
    optimization: {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          shared: {
            name: 'shared',
            chunks: 'all',
            minChunks: 2,
            priority: 10,
            enforce: true
          }
        }
      }
    }
  };
};
