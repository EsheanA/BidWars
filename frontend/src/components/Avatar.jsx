

function Avatar({name, self}) {
    return (
      <>
        <div className = "Avatar" style={{ border: self ? "2px solid red" : "2px solid black" }}>
          <img src = "/images/user2.png" width="150" height="150"/>
          <div className = "centered">{name}</div>
        </div>
      </>
    )
  }
  
  export default Avatar