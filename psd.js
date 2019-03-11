require('coffee-script/register');
var PSD = require('./lib/psd.coffee');
var fs = require("fs");
var cheerio=require('cheerio');
var http = require('http');
var path = require('path');
var rimraf = require('rimraf');

var config = require('./config')
var qiniu = require('qiniu');
var psd = null;
var $ = null;
var $wrap = null;
var content = null;



class exportPSD {
  constructor() {
    this.exportPath = "./public/upload/psd/";
    this.exportAppPath = "";

    this.saveImgPath = this.exportPath + "/images/";
    this.saveCssPath = this.exportPath + "/css/";
    this.oldTime = new Date();
    this.pngId = 0;
    this.groupId = 0;
    this.cssStyle = ''; //css字符串
    this.appName = '';
    this.viewRect = {};
  };


  buildingEngineJSON(makerJson, index, node) {
    if (node != null) {
      makerJson.pages[0].elements[index] = {}
      makerJson.pages[0].elements[index].name = node.name
      makerJson.pages[0].elements[index].des = node.des
      makerJson.pages[0].elements[index].locked = node.locked
      makerJson.pages[0].elements[index].elabEditable = true
      makerJson.pages[0].elements[index].nodeId = 'Id'+Math.random()
      makerJson.pages[0].elements[index].audioSrc = ""
      makerJson.pages[0].elements[index].allTransparent = 'rgba(0,0,0,0)'
      makerJson.pages[0].elements[index].letterSpacing = 0
      makerJson.pages[0].elements[index].textIndent = 0
      makerJson.pages[0].elements[index].children = []
      makerJson.pages[0].elements[index].morePic = []
      makerJson.pages[0].elements[index].border = ""
      makerJson.pages[0].elements[index].backgroundColor = ""
      makerJson.pages[0].elements[index].zindex = node.zindex
      makerJson.pages[0].elements[index].color = node.color
      makerJson.pages[0].elements[index].fontWeight = node.fontWeight
      makerJson.pages[0].elements[index].fontFamily = ''
      var fontSize = node.fontSize
      if (node.fontSize != "" && node.fontSize < 24) {
        fontSize = 24
      }
      //统一字体大小为24
      fontSize = 24
      makerJson.pages[0].elements[index].fontSize = fontSize
      makerJson.pages[0].elements[index].bg = ""
      makerJson.pages[0].elements[index].iconKey = ""
      makerJson.pages[0].elements[index].display = "block"
      makerJson.pages[0].elements[index].verticalAlign = ""
      makerJson.pages[0].elements[index].textAlign = node.textAlign
      makerJson.pages[0].elements[index].text = node.textLabelValue
      makerJson.pages[0].elements[index].transform = node.transform
      makerJson.pages[0].elements[index].opacity = 100
      makerJson.pages[0].elements[index].loop = false
      makerJson.pages[0].elements[index].playing = false
      makerJson.pages[0].elements[index].delay = 0
      makerJson.pages[0].elements[index].duration = 0
      makerJson.pages[0].elements[index].animatedName = ""
      makerJson.pages[0].elements[index].lineHeight = 1.5
      makerJson.pages[0].elements[index].height = node.height
      makerJson.pages[0].elements[index].width = node.width
      makerJson.pages[0].elements[index].top = node.top
      makerJson.pages[0].elements[index].left = node.left
      makerJson.pages[0].elements[index].imgSrc = node.imgSrc
      makerJson.pages[0].elements[index].type = node.type
    }

  }

  getUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }

  invokeToken (dataParm, callback) {
    var accessKey = config.qiniu.accessKey;
    var secretKey = config.qiniu.secretKey;
    var options = {
      scope: config.qiniu.bucket,
    };
    var putPolicy = new qiniu.rs.PutPolicy(options);
    var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    var token = putPolicy.uploadToken(mac);
    callback(token);
  };

  uploadPicToQiniu(file, fileName, token, complete) {
    var config = new qiniu.conf.Config();
    config.zone = qiniu.zone.Zone_z0;
    config.useCdnDomain = true;
    var formUploader = new qiniu.form_up.FormUploader(config);
    var putExtra = new qiniu.form_up.PutExtra();
    // 文件上传
    formUploader.putFile(token, fileName, file, putExtra, function(respErr, respBody, respInfo) {
      if (respErr) {
        throw respErr;
      }
      if (respInfo.statusCode == 200) {
        complete(respBody);
      } else {
        console.log(respInfo.statusCode);
      }
    });
  }
  /**
   * 打开psd文件，分析文件
   * 导出psd图层图片，导出前需要先合并下psd图层，删掉不显示的图层等
   */
  async openPSD(file,res,rej) {

    fs.mkdir(this.saveImgPath, function(){});
    var token;
    this.invokeToken('', function(data){
      token = data
    });
    var _self = this;
    _self.pngId = 0;
    var makerJson = {};//引擎JSON
    psd.parse();
    await PSD.open(file).then(async function(psd) {
      var tree = psd.tree();
      var treeJson = tree.export();

      makerJson.pages = [] // 引擎一级目录json
      makerJson.pages[0] = {}
      makerJson.pages[0].elements = []
      _self.viewRect = {
        width: treeJson.document.width,
        height: treeJson.document.height
      };
      _self.findArrAndReverse(tree);

      makerJson.title = 'psd upload title';
      makerJson.description = 'psd upload description'
      makerJson.type = 'spa'
      makerJson.createDate = new Date()
      makerJson.canvasHeight = treeJson.document.height
      makerJson.canvasWidth = treeJson.document.width
      var flag=0;
      var num=0
      await new Promise(function (resol,rejec) {

        tree.descendants().forEach(async function (node, length) {
          if (node.isGroup()) {
            node.name = "group_" + _self.groupId;
            _self.groupId++;
            return false;
          }
          if (node.layer.visible) {
            if (node.layer.adjustments.typeTool != null
              && node.layer.adjustments.typeTool.obj != null
              && node.layer.adjustments.typeTool.obj.textData != null
              && node.layer.adjustments.typeTool.obj.engineData != null) {
              node.type = 'text'
              node.textLabelValue = node.layer.adjustments.typeTool.obj.textValue
              if (node.layer.adjustments.typeTool.obj.engineData.EngineDict.StyleRun != null
                && node.layer.adjustments.typeTool.obj.engineData.EngineDict.StyleRun.RunArray.length > 0
                && node.layer.adjustments.typeTool.obj.engineData.EngineDict.StyleRun.RunArray[0].StyleSheet != null
                && node.layer.adjustments.typeTool.obj.engineData.EngineDict.StyleRun.RunArray[0].StyleSheet.StyleSheetData != null) {
                var fontData = node.layer.adjustments.typeTool.obj.engineData.EngineDict.StyleRun.RunArray[0].StyleSheet.StyleSheetData;
                node.fontSize = fontData.FontSize;
                node.fontWeight = fontData.FauxBold ? 'bold' : 'normal';
                node.des = 'text';
                // node.zindex = (_self.pngId + 1) * 100;
                node.zindex = length + 1
                if (node.layer.adjustments.typeTool.obj.engineData.EngineDict.StyleRun.RunArray[0].StyleSheet.StyleSheetData.FillColor != null) {
                  var colors = node.layer.adjustments.typeTool.obj.engineData.EngineDict.StyleRun.RunArray[0].StyleSheet.StyleSheetData.FillColor.Values;
                  var fontColor = []
                  for (var i = 0; i < colors.length; i++) {
                    fontColor.push(Math.round(colors[i] * 255))
                  }
                  node.color = 'rgba(' + fontColor.join(', ') + ')'
                }
              }
              if (node.layer.adjustments.typeTool.obj.engineData.EngineDict.ParagraphRun != null
                && node.layer.adjustments.typeTool.obj.engineData.EngineDict.ParagraphRun.RunArray != null
                && node.layer.adjustments.typeTool.obj.engineData.EngineDict.ParagraphRun.RunArray.length > 0
                && node.layer.adjustments.typeTool.obj.engineData.EngineDict.ParagraphRun.RunArray[0].ParagraphSheet != null
                && node.layer.adjustments.typeTool.obj.engineData.EngineDict.ParagraphRun.RunArray[0].ParagraphSheet.Properties.Justification != null) {
                var alignments = ['left', 'right', 'center', 'justify']
                var textAlign = alignments[Math.min(parseInt(node.layer.adjustments.typeTool.obj.engineData.EngineDict.ParagraphRun.RunArray[0].ParagraphSheet.Properties.Justification, 10), 3)]
                node.textAlign = textAlign;
              }
              node.verticalAlign = '';
              node.lineHeight = 1.5;
              node.letterSpacing = 0;
              node.textIndent = 0;
              node.backgroundColor = '';
            } else {
              flag++
              node.type = 'pic'
              node.des = 'pic';
              // node.zindex = _self.pngId + 1;
              node.zindex = length + 1;
              var imageAddress = _self.saveImgPath + Math.random() + ".png"


              await node.saveAsPng(imageAddress).catch(function (err) {
              });
              var fileName = 'psd/'+_self.getUUID() + '-' + node.name + ".png";
              await new Promise(function (resolve,reject) {
                _self.uploadPicToQiniu(imageAddress, fileName, token, function(addressUrl){
                  num++
                  resolve(addressUrl)
                  if(flag==num){
                    resol()
                  }
                });
              }).then(function (addressUrl) {
                node.imgSrc = config.qiniu.origin + addressUrl.key
                fs.unlinkSync(imageAddress)
              }).catch(function(err) {
                console.log(err)
              })
            }
            node.name = "dv_" + _self.appName + "_layer_" + length;
            node.transform = 0;

            node.display = 'block';
            node.bg = '';
            node.iconKey = '';
            node.border = '';
            node.audioSrc = '';
            node.loop = false;
            node.playing = false;
            node.delay = 0;
            node.locked = false
            if (length == 2) {
              console.log(node)
            }
            if (node != null) {
              _self.buildingEngineJSON(makerJson, length, node)
            }

            _self.pngId++;
          } else {
          }
        });
      })
      var tempJson = _self.notempty(makerJson.pages[0].elements)
      makerJson.pages[0].elements = tempJson

      fs.writeFile("json.json", JSON.stringify(makerJson, undefined, 2), {
        encoding:"utf8"
      }, function (err) {
        //console.log(err);
      });
      console.log('end psd ...')
      res(makerJson)
    }).catch(function (err) {
        rej(err)
        console.dir(err);
      });
  };


  notempty(arrays) {
    for(var i=0; i<arrays.length; i++){
      if(arrays[i] == "" || arrays[i] == null || typeof(arrays[i]) == "undefined"){
        arrays.splice(i,1);
        i--;
      }
    }
    return arrays;
  };

  /**
   * 查询所有子对象，倒序赋值
   * @param obj {Object}
   */
  findArrAndReverse(obj) {
    var _self = this;
    var datas = obj;
    if (datas._children && datas._children.length > 0) {
      _self.reverseALl(datas._children);
      for (var i = 0; i < datas._children.length; i++) {
        var item = datas._children[i];
        _self.findArrAndReverse(item);
      }
    } else {
    }
  };

  /**
   * 倒序并赋值方法
   * @param children
   */
  reverseALl(children){
    var newArr = children.reverse();
    children = newArr;
  };

  async start(file,resolve,reject) {
    let that=this;
    let obj={}
    console.log("export start...");
    psd = PSD.fromFile(file);
    console.log("export start...111111111111111");
   await new Promise(function (res,rej) {
     that.openPSD(file,res,rej)
    }).then(res=>{
      obj=res
     resolve(res)
    }).catch(rej=>{
      obj=rej;
      reject(rej)
    })
    return obj
    // return await this.openPSD(file)
  }

}

module.exports = {
  // 通用
  psdInit : new exportPSD()
}
